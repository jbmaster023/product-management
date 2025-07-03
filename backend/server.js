// server.js - Backend completo con PostgreSQL y autenticación real
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3053;

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'product_management',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'tu_password_seguro',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Función para inicializar la base de datos
async function initializeDatabase() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    // Crear tabla de usuarios si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de productos si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER DEFAULT 0,
        stock_detail TEXT,
        stock_by_branch JSONB,
        category VARCHAR(100),
        branch VARCHAR(100),
        images JSONB,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de pedidos si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        products JSONB NOT NULL,
        address TEXT,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verificar si existe el usuario admin
    const adminExists = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );

    // Crear usuario admin por defecto si no existe
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO users (username, email, password, role)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@sistema.com', hashedPassword, 'admin']);
      
      console.log('✅ Usuario admin creado: admin / admin123');
    }

    // Insertar productos de ejemplo si la tabla está vacía
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(productsCount.rows[0].count) === 0) {
      await insertSampleProducts();
    }

    // Insertar pedidos de ejemplo si la tabla está vacía
    const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
    if (parseInt(ordersCount.rows[0].count) === 0) {
      await insertSampleOrders();
    }

    console.log('✅ Base de datos inicializada correctamente');
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  }
}

// Función para insertar productos de ejemplo
async function insertSampleProducts() {
  const sampleProducts = [
    {
      name: 'Laptop Dell Inspiron',
      description: 'Laptop potente para trabajo y estudio',
      price: 45000,
      stock: 8,
      stock_detail: 'Principal: 5, Higüey: 3',
      stock_by_branch: { "Principal": 5, "Higüey": 3 },
      category: 'Electrónicos',
      branch: 'Principal',
      active: true
    },
    {
      name: 'Mouse Inalámbrico',
      description: 'Mouse ergonómico con conectividad Bluetooth',
      price: 1500,
      stock: 30,
      stock_detail: 'Principal: 18, Higüey: 12',
      stock_by_branch: { "Principal": 18, "Higüey": 12 },
      category: 'Electrónicos',
      branch: 'Principal',
      active: true
    },
    {
      name: 'Teclado Mecánico',
      description: 'Teclado RGB para gaming',
      price: 3500,
      stock: 15,
      stock_detail: 'Principal: 8, Higüey: 7',
      stock_by_branch: { "Principal": 8, "Higüey": 7 },
      category: 'Electrónicos',
      branch: 'Principal',
      active: false
    }
  ];

  for (const product of sampleProducts) {
    await pool.query(`
      INSERT INTO products (name, description, price, stock, stock_detail, stock_by_branch, category, branch, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      product.name,
      product.description,
      product.price,
      product.stock,
      product.stock_detail,
      JSON.stringify(product.stock_by_branch),
      product.category,
      product.branch,
      product.active
    ]);
  }

  console.log('✅ Productos de ejemplo insertados');
}

// Función para insertar pedidos de ejemplo
async function insertSampleOrders() {
  const sampleOrders = [
    {
      customer_name: 'Juan Pérez',
      products: [{"name": "Laptop Dell Inspiron", "quantity": 1, "price": 45000}],
      address: 'Santo Domingo, República Dominicana',
      total: 45000,
      status: 'completed'
    }
  ];

  for (const order of sampleOrders) {
    await pool.query(`
      INSERT INTO orders (customer_name, products, address, total, status)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      order.customer_name,
      JSON.stringify(order.products),
      order.address,
      order.total,
      order.status
    ]);
  }

  console.log('✅ Pedidos de ejemplo insertados');
}

// Rutas básicas
app.get('/api/health', async (req, res) => {
  try {
    console.log('✅ Health check requested');
    
    // Verificar conexión a la base de datos
    const dbCheck = await pool.query('SELECT NOW()');
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      message: 'Backend funcionando correctamente',
      database: {
        connected: true,
        serverTime: dbCheck.rows[0].now,
        productsCount: parseInt(productsCount.rows[0].count),
        usersCount: parseInt(usersCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR',
      message: 'Error de conexión a la base de datos',
      error: error.message
    });
  }
});

// Login con autenticación real
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body.username);
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    // Buscar usuario en la base de datos
    const userQuery = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND active = true',
      [username]
    );

    if (userQuery.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', username);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = userQuery.rows[0];
    
    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      console.log('❌ Contraseña incorrecta para usuario:', username);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    console.log('✅ Login exitoso para usuario:', username);
    
    // Respuesta exitosa (sin incluir la contraseña)
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      user: userWithoutPassword,
      message: 'Login exitoso'
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Productos
app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Getting products...');
    const search = req.query.search || '';
    const status = req.query.status;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    // Filtro de búsqueda
    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount} OR category ILIKE $${paramCount})`;
      values.push(`%${search}%`);
    }
    
    // Filtro de estado
    if (status === 'active') {
      paramCount++;
      query += ` AND active = $${paramCount}`;
      values.push(true);
    } else if (status === 'inactive') {
      paramCount++;
      query += ` AND active = $${paramCount}`;
      values.push(false);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, values);
    
    console.log(`✅ Returning ${result.rows.length} products`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error getting products:', error);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    console.log('📝 Creating product:', req.body);
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    if (!name || !price || !stock || !branch) {
      return res.status(400).json({ error: 'Nombre, precio, stock y sucursal son requeridos' });
    }
    
    const result = await pool.query(`
      INSERT INTO products (name, description, price, stock, stock_detail, stock_by_branch, category, branch, images, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      name,
      description || '',
      parseFloat(price),
      parseInt(stock),
      `${branch}: ${stock}`,
      JSON.stringify({ [branch]: parseInt(stock) }),
      category,
      branch,
      JSON.stringify(images),
      true
    ]);
    
    console.log('✅ Product created with ID:', result.rows[0].id);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error creating product:', error);
    res.status(500).json({ error: 'Error creando producto' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    console.log(`📝 Updating product ${id}`);
    
    const result = await pool.query(`
      UPDATE products 
      SET name = $1, description = $2, price = $3, stock = $4, branch = $5, 
          category = $6, images = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [
      name,
      description,
      parseFloat(price),
      parseInt(stock),
      branch,
      category,
      JSON.stringify(images),
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log('✅ Product updated');
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

// Cambiar estado del producto
app.patch('/api/products/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    console.log(`🔄 Updating product ${id} status to: ${active}`);
    
    const result = await pool.query(`
      UPDATE products 
      SET active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [Boolean(active), id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log(`✅ Product ${id} status updated to: ${result.rows[0].active}`);
    res.json({ 
      success: true, 
      message: `Producto ${active ? 'activado' : 'desactivado'} correctamente`,
      product: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error updating product status:', error);
    res.status(500).json({ error: 'Error actualizando estado del producto' });
  }
});

app.put('/api/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_principal, stock_higuey } = req.body;
    
    console.log(`📦 Updating stock for product ${id}`);
    
    const totalStock = (parseInt(stock_principal) || 0) + (parseInt(stock_higuey) || 0);
    const stockDetail = `Principal: ${stock_principal || 0}, Higüey: ${stock_higuey || 0}`;
    const stockByBranch = {
      'Principal': parseInt(stock_principal) || 0,
      'Higüey': parseInt(stock_higuey) || 0
    };
    
    const result = await pool.query(`
      UPDATE products 
      SET stock = $1, stock_detail = $2, stock_by_branch = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [totalStock, stockDetail, JSON.stringify(stockByBranch), id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log('✅ Stock updated');
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error updating stock:', error);
    res.status(500).json({ error: 'Error actualizando stock' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting product ${id}`);
    
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log('✅ Product deleted');
    res.json({ success: true, message: 'Producto eliminado correctamente' });
    
  } catch (error) {
    console.error('❌ Error deleting product:', error);
    res.status(500).json({ error: 'Error eliminando producto' });
  }
});

// Pedidos
app.get('/api/orders', async (req, res) => {
  try {
    console.log('🛒 Getting orders...');
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error getting orders:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    console.log('📝 Creating order:', req.body);
    const { customer_name, products, address, total, status = 'pending' } = req.body;
    
    const result = await pool.query(`
      INSERT INTO orders (customer_name, products, address, total, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [customer_name, JSON.stringify(products), address, parseFloat(total), status]);
    
    console.log('✅ Order created');
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Error creando pedido' });
  }
});

// Estadísticas
app.get('/api/stats', async (req, res) => {
  try {
    console.log('📊 Getting stats...');
    
    const [productsTotal, productsActive, productsValue, ordersTotal, salesTotal] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM products'),
      pool.query('SELECT COUNT(*) FROM products WHERE active = true'),
      pool.query('SELECT SUM(price * stock) as total FROM products'),
      pool.query('SELECT COUNT(*) FROM orders'),
      pool.query('SELECT SUM(total) as total FROM orders')
    ]);
    
    const stats = {
      totalProducts: parseInt(productsTotal.rows[0].count),
      activeProducts: parseInt(productsActive.rows[0].count),
      inactiveProducts: parseInt(productsTotal.rows[0].count) - parseInt(productsActive.rows[0].count),
      totalValue: parseFloat(productsValue.rows[0].total) || 0,
      totalOrders: parseInt(ordersTotal.rows[0].count),
      totalSales: parseFloat(salesTotal.rows[0].total) || 0
    };
    
    console.log('✅ Stats calculated:', stats);
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// Ruta para obtener categorías
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != \'\'');
    const categories = result.rows.map(row => row.category);
    console.log('📂 Getting categories:', categories);
    res.json(categories);
  } catch (error) {
    console.error('❌ Error getting categories:', error);
    res.status(500).json({ error: 'Error obteniendo categorías' });
  }
});

// Ruta para obtener sucursales
app.get('/api/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT branch FROM products WHERE branch IS NOT NULL AND branch != \'\'');
    const branches = result.rows.map(row => row.branch);
    console.log('🏢 Getting branches:', branches);
    res.json(branches);
  } catch (error) {
    console.error('❌ Error getting branches:', error);
    res.status(500).json({ error: 'Error obteniendo sucursales' });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión con PostgreSQL',
    status: 'OK',
    version: '3.0.0',
    features: [
      'Autenticación real con PostgreSQL',
      'Gestión de productos con estado activo/inactivo',
      'Filtros avanzados por estado y categoría',
      'Estadísticas en tiempo real',
      'Control de stock por sucursal',
      'Sistema de usuarios con roles'
    ],
    endpoints: [
      'GET /api/health - Estado del sistema',
      'POST /api/auth/login - Autenticación',
      'GET /api/products - Listar productos',
      'POST /api/products - Crear producto',
      'PUT /api/products/:id - Actualizar producto',
      'PATCH /api/products/:id/status - Cambiar estado',
      'PUT /api/products/:id/stock - Actualizar stock',
      'DELETE /api/products/:id - Eliminar producto',
      'GET /api/orders - Listar pedidos',
      'POST /api/orders - Crear pedido',
      'GET /api/stats - Estadísticas',
      'GET /api/categories - Categorías',
      'GET /api/branches - Sucursales'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❌ 404 Not Found:', req.path);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar servidor
async function startServer() {
  try {
    // Probar conexión a la base de datos
    await pool.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL establecida');
    
    // Inicializar base de datos
    await initializeDatabase();
    
    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND CON POSTGRESQL INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API Local: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: ${process.env.DB_NAME || 'product_management'}`);
      console.log('🔐 Usuario por defecto: admin / admin123');
      console.log('🆕 Funcionalidades: Autenticación real, Control de estado');
      console.log('=================================');
    });
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    console.error('💡 Verifica que PostgreSQL esté ejecutándose y la configuración sea correcta');
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\n🔄 Cerrando servidor...');
  await pool.end();
  console.log('✅ Conexiones cerradas');
  process.exit(0);
});

// Iniciar aplicación
startServer();
