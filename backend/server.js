// server.js - Backend API Simplificado (sin multer por ahora)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3053;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Configuración de PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'product_management',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password',
});

// Test de conexión a la base de datos
pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error de conexión a PostgreSQL:', err);
});

// Inicializar base de datos
async function initDatabase() {
  try {
    // Crear tablas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER NOT NULL,
        branch VARCHAR(100) NOT NULL,
        images JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        products JSONB NOT NULL,
        address TEXT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insertar usuario admin por defecto
    const adminExists = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'admin']
      );
      console.log('✅ Usuario admin creado');
    }

    // Insertar datos de ejemplo si no existen
    const productsExist = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(productsExist.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, description, price, stock, branch, images) VALUES
        ('Laptop Dell XPS 13', 'Laptop ultrabook con procesador Intel Core i7', 1299.99, 15, 'Principal', '[]'),
        ('iPhone 15 Pro', 'Smartphone Apple con chip A17 Pro', 999.99, 25, 'Norte', '[]'),
        ('Samsung Galaxy S24', 'Smartphone Android con cámara de 200MP', 899.99, 30, 'Sur', '[]'),
        ('MacBook Air M3', 'Laptop Apple con chip M3', 1199.99, 12, 'Principal', '[]'),
        ('Google Pixel 8', 'Smartphone Google con IA avanzada', 699.99, 18, 'Este', '[]')
      `);

      await pool.query(`
        INSERT INTO orders (customer_name, products, address, total, status) VALUES
        ('Juan Pérez', '[{"name": "Laptop Dell XPS 13", "quantity": 1, "price": 1299.99}]', 'Calle Principal 123, Santo Domingo', 1299.99, 'pending'),
        ('María González', '[{"name": "iPhone 15 Pro", "quantity": 2, "price": 999.99}]', 'Av. Independencia 456, Santo Domingo Este', 1999.98, 'completed'),
        ('Carlos Rodríguez', '[{"name": "Samsung Galaxy S24", "quantity": 1, "price": 899.99}, {"name": "iPhone 15 Pro", "quantity": 1, "price": 999.99}]', 'Calle Mella 789, Santiago', 1899.98, 'processing'),
        ('Ana Martín', '[{"name": "MacBook Air M3", "quantity": 1, "price": 1199.99}]', 'Plaza Central 456, La Vega', 1199.99, 'pending')
      `);
      console.log('✅ Datos de ejemplo insertados');
    }

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  }
}

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas de salud
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      dbTime: dbCheck.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message
    });
  }
});

// Rutas de autenticación
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    const user = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    res.json({
      success: true,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        role: user.rows[0].role
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas de productos
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, stock, branch, images = [] } = req.body;
    
    if (!name || !price || !stock || !branch) {
      return res.status(400).json({ error: 'Campos requeridos: name, price, stock, branch' });
    }

    const result = await pool.query(
      'INSERT INTO products (name, description, price, stock, branch, images) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, parseFloat(price), parseInt(stock), branch, JSON.stringify(images)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ error: 'Error creando producto' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, branch, images = [] } = req.body;
    
    if (!name || !price || !stock || !branch) {
      return res.status(400).json({ error: 'Campos requeridos: name, price, stock, branch' });
    }

    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, branch = $5, images = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [name, description, parseFloat(price), parseInt(stock), branch, JSON.stringify(images), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

// Rutas de pedidos
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pedidos:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, products, address, total, status = 'pending' } = req.body;
    
    if (!customer_name || !products || !address || !total) {
      return res.status(400).json({ error: 'Campos requeridos: customer_name, products, address, total' });
    }
    
    const result = await pool.query(
      'INSERT INTO orders (customer_name, products, address, total, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [customer_name, JSON.stringify(products), address, parseFloat(total), status]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creando pedido:', error);
    res.status(500).json({ error: 'Error creando pedido' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status requerido' });
    }
    
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando estado del pedido:', error);
    res.status(500).json({ error: 'Error actualizando estado del pedido' });
  }
});

// Ruta de estadísticas
app.get('/api/stats', async (req, res) => {
  try {
    const [productsCount, productsValue, ordersCount, salesTotal] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM products'),
      pool.query('SELECT COALESCE(SUM(price * stock), 0) as total_value FROM products'),
      pool.query('SELECT COUNT(*) FROM orders'),
      pool.query('SELECT COALESCE(SUM(total), 0) as total_sales FROM orders')
    ]);

    res.json({
      totalProducts: parseInt(productsCount.rows[0].count),
      totalValue: parseFloat(productsValue.rows[0].total_value || 0),
      totalOrders: parseInt(ordersCount.rows[0].count),
      totalSales: parseFloat(salesTotal.rows[0].total_sales || 0)
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// Servir archivos estáticos (el frontend)
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Sistema de Gestión de Productos',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/products',
      'POST /api/products',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /api/orders',
      'POST /api/orders',
      'PUT /api/orders/:id/status',
      'GET /api/stats'
    ]
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar servidor
async function startServer() {
  try {
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 API disponible en: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

startServer().catch(console.error);