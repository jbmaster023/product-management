// server.js - Backend Híbrido: PostgreSQL con Fallback a Memoria
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3053;

// Configuración de PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'product_management',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password',
});

// Variable para saber si PostgreSQL está disponible
let dbConnected = false;

// Middleware básico
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Datos de fallback en memoria
let memoryCategories = [
  { id: 1, name: 'General' },
  { id: 2, name: 'Electrónica' },
  { id: 3, name: 'Hogar' }
];

let memoryProducts = [
  {
    id: 1,
    name: 'Laptop Dell XPS 13',
    description: 'Laptop ultrabook con procesador Intel Core i7',
    price: 1299.99,
    stock: 15,
    category: 'Electrónica',
    branch: 'Principal',
    images: '[]',
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'iPhone 15 Pro',
    description: 'Smartphone Apple con chip A17 Pro',
    price: 999.99,
    stock: 25,
    category: 'Electrónica',
    branch: 'Norte',
    images: '[]',
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Samsung Galaxy S24',
    description: 'Smartphone Android con cámara de 200MP',
    price: 899.99,
    stock: 30,
    category: 'Electrónica',
    branch: 'Sur',
    images: '[]',
    created_at: new Date().toISOString()
  }
];

let memoryOrders = [
  {
    id: 1001,
    customer_name: 'Juan Pérez',
    products: '[{"name": "Laptop Dell XPS 13", "quantity": 1, "price": 1299.99}]',
    address: 'Calle Principal 123, Santo Domingo',
    total: 1299.99,
    status: 'pending',
    created_at: new Date().toISOString()
  },
  {
    id: 1002,
    customer_name: 'María González',
    products: '[{"name": "iPhone 15 Pro", "quantity": 2, "price": 999.99}]',
    address: 'Av. Independencia 456, Santo Domingo Este',
    total: 1999.98,
    status: 'completed',
    created_at: new Date().toISOString()
  }
];

// Test de conexión a PostgreSQL
async function testDatabaseConnection() {
  try {
    console.log('🔄 Testing PostgreSQL connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    dbConnected = true;
    console.log('✅ PostgreSQL connected successfully:', result.rows[0].now);
    return true;
  } catch (error) {
    dbConnected = false;
    console.log('❌ PostgreSQL not available, using memory fallback:', error.message);
    return false;
  }
}

// Inicializar base de datos PostgreSQL
async function initDatabase() {
  if (!dbConnected) return;
  
  try {
    console.log('🔄 Initializing PostgreSQL database...');
    
    // Crear tablas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER NOT NULL,
        branch VARCHAR(100) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
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

    // Crear usuario admin
    const adminExists = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'admin']
      );
      console.log('✅ Admin user created in PostgreSQL');
    }

    // Migrar datos de memoria a PostgreSQL si están vacías las tablas
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    const categoriesCount = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(productsCount.rows[0].count) === 0 && parseInt(categoriesCount.rows[0].count) === 0) {
      console.log('📦 Migrating memory data to PostgreSQL...');
      
      for (const category of memoryCategories) {
        await pool.query(
          'INSERT INTO categories (name) VALUES ($1)',
          [category.name]
        );
      }

      for (const product of memoryProducts) {
        const catRes = await pool.query(
          'SELECT id FROM categories WHERE name = $1',
          [product.category]
        );
        const catId = catRes.rows.length ? catRes.rows[0].id : null;
        await pool.query(
          'INSERT INTO products (name, description, price, stock, branch, category_id, images) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [product.name, product.description, product.price, product.stock, product.branch, catId, product.images]
        );
      }
      
      for (const order of memoryOrders) {
        await pool.query(
          'INSERT INTO orders (customer_name, products, address, total, status) VALUES ($1, $2, $3, $4, $5)',
          [order.customer_name, order.products, order.address, order.total, order.status]
        );
      }
      
      console.log('✅ Data migration completed');
    }

    console.log('🎉 PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing PostgreSQL:', error);
    dbConnected = false;
  }
}

// Rutas de salud
app.get('/api/health', async (req, res) => {
  const dbStatus = dbConnected ? 'PostgreSQL Connected' : 'In-Memory Fallback';
  
  let dbTime = null;
  if (dbConnected) {
    try {
      const result = await pool.query('SELECT NOW()');
      dbTime = result.rows[0].now;
    } catch (error) {
      dbConnected = false;
    }
  }
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    dbTime: dbTime,
    message: 'Backend funcionando correctamente'
  });
});

// Rutas de autenticación
app.post('/api/auth/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    if (dbConnected) {
      // Login con PostgreSQL
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

      console.log('✅ PostgreSQL login successful');
      res.json({
        success: true,
        user: {
          id: user.rows[0].id,
          username: user.rows[0].username,
          role: user.rows[0].role
        }
      });
    } else {
      // Fallback login (memoria)
      if (username === 'admin' && password === 'admin123') {
        console.log('✅ Memory fallback login successful');
        res.json({
          success: true,
          user: {
            id: 1,
            username: 'admin',
            role: 'admin'
          }
        });
      } else {
        res.status(401).json({ error: 'Credenciales incorrectas' });
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas de categorías
app.get('/api/categories', async (req, res) => {
  try {
    if (dbConnected) {
      const result = await pool.query('SELECT * FROM categories ORDER BY name');
      res.json(result.rows);
    } else {
      res.json(memoryCategories);
    }
  } catch (error) {
    console.error('Error getting categories:', error);
    res.json(memoryCategories);
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    if (dbConnected) {
      const result = await pool.query(
        'INSERT INTO categories (name) VALUES ($1) RETURNING *',
        [name]
      );
      res.json(result.rows[0]);
    } else {
      const newCategory = { id: Date.now(), name };
      memoryCategories.push(newCategory);
      res.json(newCategory);
    }
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Error creando categoría' });
  }
});

// Rutas de productos
app.get('/api/products', async (req, res) => {
  try {
    const search = req.query.search || '';
    if (dbConnected) {
      if (search) {
        const result = await pool.query(
          `SELECT p.*, c.name AS category
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.name ILIKE $1 OR p.description ILIKE $1
           ORDER BY p.created_at DESC`,
          [`%${search}%`]
        );
        res.json(result.rows);
      } else {
        const result = await pool.query(
          `SELECT p.*, c.name AS category
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           ORDER BY p.created_at DESC`
        );
        res.json(result.rows);
      }
    } else {
      let products = memoryProducts;
      if (search) {
        const term = search.toLowerCase();
        products = products.filter(p =>
          p.name.toLowerCase().includes(term) ||
          (p.description && p.description.toLowerCase().includes(term))
        );
      }
      res.json(products);
    }
  } catch (error) {
    console.error('Error getting products:', error);
    res.json(memoryProducts); // Fallback
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    if (!name || !price || !stock || !branch) {
      return res.status(400).json({ error: 'Campos requeridos: name, price, stock, branch' });
    }

    if (dbConnected) {
      let categoryId = null;
      if (category) {
        const catRes = await pool.query('SELECT id FROM categories WHERE name = $1', [category]);
        if (catRes.rows.length) {
          categoryId = catRes.rows[0].id;
        }
      }
      const insert = await pool.query(
        'INSERT INTO products (name, description, price, stock, branch, category_id, images) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [name, description, parseFloat(price), parseInt(stock), branch, categoryId, JSON.stringify(images)]
      );
      const result = await pool.query(
        `SELECT p.*, c.name AS category
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = $1`,
        [insert.rows[0].id]
      );
      res.json(result.rows[0]);
    } else {
      const newProduct = {
        id: Date.now(),
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock),
        branch,
        category,
        images: JSON.stringify(images),
        created_at: new Date().toISOString()
      };
      memoryProducts.push(newProduct);
      res.json(newProduct);
    }
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error creando producto' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    if (dbConnected) {
      let categoryId = null;
      if (category) {
        const catRes = await pool.query('SELECT id FROM categories WHERE name = $1', [category]);
        if (catRes.rows.length) categoryId = catRes.rows[0].id;
      }
      const result = await pool.query(
        'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, branch = $5, category_id = $6, images = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING id',
        [name, description, parseFloat(price), parseInt(stock), branch, categoryId, JSON.stringify(images), id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      const updated = await pool.query(
        `SELECT p.*, c.name AS category
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = $1`,
        [id]
      );
      res.json(updated.rows[0]);
    } else {
      const productIndex = memoryProducts.findIndex(p => p.id == id);
      if (productIndex === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      memoryProducts[productIndex] = {
        ...memoryProducts[productIndex],
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock),
        branch,
        category,
        images: JSON.stringify(images)
      };
      res.json(memoryProducts[productIndex]);
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (dbConnected) {
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
    } else {
      const productIndex = memoryProducts.findIndex(p => p.id == id);
      if (productIndex === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      memoryProducts.splice(productIndex, 1);
    }
    
    res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

// Rutas de pedidos
app.get('/api/orders', async (req, res) => {
  try {
    if (dbConnected) {
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      res.json(result.rows);
    } else {
      res.json(memoryOrders);
    }
  } catch (error) {
    console.error('Error getting orders:', error);
    res.json(memoryOrders);
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, products, address, total, status = 'pending' } = req.body;
    
    if (dbConnected) {
      const result = await pool.query(
        'INSERT INTO orders (customer_name, products, address, total, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [customer_name, JSON.stringify(products), address, parseFloat(total), status]
      );
      res.json(result.rows[0]);
    } else {
      const newOrder = {
        id: Date.now(),
        customer_name,
        products: JSON.stringify(products),
        address,
        total: parseFloat(total),
        status,
        created_at: new Date().toISOString()
      };
      memoryOrders.push(newOrder);
      res.json(newOrder);
    }
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Error creando pedido' });
  }
});

// Ruta de estadísticas
app.get('/api/stats', async (req, res) => {
  try {
    if (dbConnected) {
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
    } else {
      const totalProducts = memoryProducts.length;
      const totalValue = memoryProducts.reduce((sum, product) => sum + (product.price * product.stock), 0);
      const totalOrders = memoryOrders.length;
      const totalSales = memoryOrders.reduce((sum, order) => sum + order.total, 0);
      
      res.json({
        totalProducts,
        totalValue,
        totalOrders,
        totalSales
      });
    }
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Sistema de Gestión de Productos',
    database: dbConnected ? 'PostgreSQL' : 'In-Memory',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/products',
      'POST /api/products',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /api/categories',
      'POST /api/categories',
      'GET /api/orders',
      'POST /api/orders',
      'GET /api/stats'
    ]
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar servidor
async function startServer() {
  try {
    // Test de conexión a PostgreSQL
    await testDatabaseConnection();
    
    if (dbConnected) {
      await initDatabase();
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND HÍBRIDO INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: ${dbConnected ? 'PostgreSQL' : 'In-Memory'}`);
      console.log(`🔐 Login: admin / admin123`);
      console.log('=================================');
    });
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

// Manejo de cierre
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  if (dbConnected) {
    await pool.end();
  }
  process.exit(0);
});

startServer().catch(console.error);