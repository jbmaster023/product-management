// server.js - Backend Node.js con PostgreSQL CORREGIDO
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

// Datos en memoria como fallback
let memoryProducts = [
  {
    id: 1,
    name: "Laptop Dell Inspiron",
    description: "Laptop potente para trabajo y estudio",
    price: 45000,
    stock: 8,
    stock_detail: "Principal: 5, Higüey: 3",
    stock_by_branch: { "Principal": 5, "Higüey": 3 },
    category: "Electrónicos",
    branch: "Principal",
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    name: "Mouse Inalámbrico",
    description: "Mouse ergonómico con conectividad Bluetooth",
    price: 1500,
    stock: 30,
    stock_detail: "Principal: 18, Higüey: 12",
    stock_by_branch: { "Principal": 18, "Higüey": 12 },
    category: "Electrónicos",
    branch: "Principal",
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    name: "Teclado Mecánico",
    description: "Teclado RGB para gaming",
    price: 3500,
    stock: 15,
    stock_detail: "Principal: 8, Higüey: 7",
    stock_by_branch: { "Principal": 8, "Higüey": 7 },
    category: "Electrónicos",
    branch: "Principal",
    created_at: new Date().toISOString()
  }
];

let memoryOrders = [
  {
    id: 1,
    customer_name: "Juan Pérez",
    products: [{"name": "Laptop Dell Inspiron", "quantity": 1, "price": 45000}],
    address: "Santo Domingo, República Dominicana",
    total: 45000,
    status: "completed",
    created_at: new Date().toISOString()
  }
];

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
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.log('📝 Using in-memory data as fallback');
    return false;
  }
}

// Inicializar base de datos PostgreSQL
async function initDatabase() {
  if (!dbConnected) {
    console.log('⚠️ Skipping database initialization - using memory storage');
    return;
  }
  
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
      CREATE TABLE IF NOT EXISTS productos (
        id_articulo INT PRIMARY KEY,
        numero_articulo VARCHAR(50),
        nombre VARCHAR(255) NOT NULL,
        categoria VARCHAR(100),
        costo DECIMAL(10,2) DEFAULT 0,
        descripcion TEXT,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sucursales (
        id INT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        codigo VARCHAR(20),
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventarios (
        id SERIAL PRIMARY KEY,
        id_articulo INT NOT NULL,
        sucursal_id INT NOT NULL,
        cantidad INT DEFAULT 0,
        cantidad_anterior INT DEFAULT 0,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_articulo) REFERENCES productos(id_articulo) ON DELETE CASCADE,
        FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
        UNIQUE(id_articulo, sucursal_id)
      );
    `);

    await pool.query(`
      INSERT INTO sucursales (id, nombre, codigo) VALUES
        (1, 'PRINCIPAL', 'PRIN'),
        (2, 'SUCURSAL HIGÜEY', 'HIG')
      ON CONFLICT (id) DO NOTHING;
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

    // Insertar productos de ejemplo si no existen
    const productCount = await pool.query('SELECT COUNT(*) FROM productos');
    if (parseInt(productCount.rows[0].count) === 0) {
      console.log('📦 Inserting sample products...');
      
      for (const product of memoryProducts) {
        await pool.query(
          'INSERT INTO productos (id_articulo, numero_articulo, nombre, categoria, costo, descripcion) VALUES ($1, $2, $3, $4, $5, $6)',
          [product.id, `ART${product.id}`, product.name, product.category, product.price, product.description]
        );
        
        // Agregar stock en ambas sucursales
        if (product.stock_by_branch) {
          for (const [sucursal, cantidad] of Object.entries(product.stock_by_branch)) {
            const sucursalId = sucursal === 'Principal' ? 1 : 2;
            await pool.query(
              'INSERT INTO inventarios (id_articulo, sucursal_id, cantidad) VALUES ($1, $2, $3)',
              [product.id, sucursalId, cantidad]
            );
          }
        }
      }
      console.log('✅ Sample products inserted with branch inventory');
    }

    console.log('🎉 PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing PostgreSQL:', error);
    dbConnected = false;
  }
}

// Rutas de salud
app.get('/api/health', async (req, res) => {
  const dbStatus = dbConnected ? 'PostgreSQL Connected' : 'Memory Storage (PostgreSQL not available)';

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
    message: 'Backend funcionando correctamente',
    memoryProductsCount: memoryProducts.length,
    dbConnected: dbConnected
  });
});

// Rutas de autenticación
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Login attempt:', req.body);
  
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
      // Login simple para modo memoria
      if (username === 'admin' && password === 'admin123') {
        console.log('✅ Memory mode login successful');
        res.json({
          success: true,
          user: {
            id: 1,
            username: 'admin',
            role: 'admin'
          }
        });
      } else {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas de productos
app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Getting products...');
    const search = req.query.search || '';
    
    if (dbConnected) {
      console.log('📊 Using PostgreSQL database');
      const baseQuery = `SELECT 
                          p.id_articulo AS id, 
                          p.nombre AS name, 
                          p.descripcion AS description,
                          p.costo AS price, 
                          p.categoria AS category, 
                          'Principal' AS branch,
                          COALESCE(SUM(i.cantidad), 0) AS stock,
                          STRING_AGG(
                            s.nombre || ': ' || COALESCE(i.cantidad, 0), 
                            ', ' ORDER BY s.nombre
                          ) AS stock_detail,
                          p.created_at, 
                          p.updated_at
                         FROM productos p
                         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
                         LEFT JOIN sucursales s ON i.sucursal_id = s.id
                         WHERE p.activo = TRUE`;
      
      let result;
      if (search) {
        result = await pool.query(
          baseQuery + ' AND (p.nombre ILIKE $1 OR p.descripcion ILIKE $1) GROUP BY p.id_articulo, p.nombre, p.descripcion, p.costo, p.categoria, p.created_at, p.updated_at ORDER BY p.created_at DESC',
          [`%${search}%`]
        );
      } else {
        result = await pool.query(
          baseQuery + ' GROUP BY p.id_articulo, p.nombre, p.descripcion, p.costo, p.categoria, p.created_at, p.updated_at ORDER BY p.created_at DESC'
        );
      }
      
      console.log(`✅ Found ${result.rows.length} products in database`);
      res.json(result.rows);
    } else {
      console.log('💾 Using memory storage');
      let filteredProducts = [...memoryProducts];
      
      if (search) {
        filteredProducts = memoryProducts.filter(product => 
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          (product.description && product.description.toLowerCase().includes(search.toLowerCase()))
        );
      }
      
      console.log(`✅ Found ${filteredProducts.length} products in memory`);
      res.json(filteredProducts);
    }
  } catch (error) {
    console.error('❌ Error getting products:', error);
    res.status(500).json({ error: 'Error obteniendo productos: ' + error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    console.log('📝 Creating product:', req.body);
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    if (!name || !price || !stock || !branch) {
      return res.status(400).json({ error: 'Campos requeridos: name, price, stock, branch' });
    }

    if (dbConnected) {
      const numeroArticulo = Date.now().toString();
      const idArticulo = Date.now();
      
      await pool.query(
        'INSERT INTO productos (id_articulo, numero_articulo, nombre, categoria, costo, descripcion) VALUES ($1, $2, $3, $4, $5, $6)',
        [idArticulo, numeroArticulo, name, category, parseFloat(price), description]
      );
      
      // Agregar inventario en la sucursal seleccionada
      const sucursalId = branch === 'Principal' ? 1 : 2;
      await pool.query(
        'INSERT INTO inventarios (id_articulo, sucursal_id, cantidad) VALUES ($1, $2, $3)',
        [idArticulo, sucursalId, parseInt(stock)]
      );
      
      // Obtener el producto completo con información de sucursales
      const result = await pool.query(
        `SELECT 
          p.id_articulo AS id, 
          p.nombre AS name, 
          p.descripcion AS description, 
          p.costo AS price,
          p.categoria AS category,
          COALESCE(SUM(i.cantidad), 0) AS stock,
          STRING_AGG(
            s.nombre || ': ' || COALESCE(i.cantidad, 0), 
            ', ' ORDER BY s.nombre
          ) AS stock_detail,
          p.created_at, 
          p.updated_at
         FROM productos p
         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
         LEFT JOIN sucursales s ON i.sucursal_id = s.id
         WHERE p.id_articulo = $1
         GROUP BY p.id_articulo, p.nombre, p.descripcion, p.costo, p.categoria, p.created_at, p.updated_at`,
        [idArticulo]
      );
      
      console.log('✅ Product created in database');
      res.json(result.rows[0]);
    } else {
      // Crear en memoria
      const newProduct = {
        id: Date.now(),
        name,
        description: description || '',
        price: parseFloat(price),
        stock: parseInt(stock),
        stock_detail: `${branch}: ${stock}`,
        stock_by_branch: { [branch]: parseInt(stock) },
        category,
        branch,
        images,
        created_at: new Date().toISOString()
      };
      
      memoryProducts.push(newProduct);
      console.log('✅ Product created in memory');
      res.json(newProduct);
    }
  } catch (error) {
    console.error('❌ Error creating product:', error);
    res.status(500).json({ error: 'Error creando producto: ' + error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, branch, category = '', images = [] } = req.body;
    
    console.log(`📝 Updating product ${id}:`, req.body);
    
    if (dbConnected) {
      const result = await pool.query(
        'UPDATE productos SET nombre = $1, descripcion = $2, costo = $3, categoria = $4, updated_at = CURRENT_TIMESTAMP WHERE id_articulo = $5 RETURNING id_articulo',
        [name, description, parseFloat(price), category, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      // Actualizar inventario
      await pool.query(
        'UPDATE inventarios SET cantidad = $1 WHERE id_articulo = $2 AND sucursal_id = 1',
        [parseInt(stock), id]
      );
      
      const updated = await pool.query(
        `SELECT p.id_articulo AS id, p.nombre AS name, p.descripcion AS description, p.costo AS price,
                COALESCE(SUM(i.cantidad),0) AS stock, p.categoria AS category,
                p.created_at, p.updated_at
         FROM productos p
         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
         WHERE p.id_articulo = $1
         GROUP BY p.id_articulo`,
        [id]
      );
      
      console.log('✅ Product updated in database');
      res.json(updated.rows[0]);
    } else {
      // Actualizar en memoria
      const index = memoryProducts.findIndex(p => p.id == id);
      if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      memoryProducts[index] = {
        ...memoryProducts[index],
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock),
        branch,
        category,
        images
      };
      
      console.log('✅ Product updated in memory');
      res.json(memoryProducts[index]);
    }
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ error: 'Error actualizando producto: ' + error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting product ${id}`);
    
    if (dbConnected) {
      const result = await pool.query('DELETE FROM productos WHERE id_articulo = $1 RETURNING *', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      console.log('✅ Product deleted from database');
    } else {
      // Eliminar de memoria
      const index = memoryProducts.findIndex(p => p.id == id);
      if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      memoryProducts.splice(index, 1);
      console.log('✅ Product deleted from memory');
    }

    res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error('❌ Error deleting product:', error);
    res.status(500).json({ error: 'Error eliminando producto: ' + error.message });
  }
});

// Rutas de pedidos
app.get('/api/orders', async (req, res) => {
  try {
    console.log('🛒 Getting orders...');
    
    if (dbConnected) {
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      console.log(`✅ Found ${result.rows.length} orders in database`);
      res.json(result.rows);
    } else {
      console.log(`✅ Found ${memoryOrders.length} orders in memory`);
      res.json(memoryOrders);
    }
  } catch (error) {
    console.error('❌ Error getting orders:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos: ' + error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    console.log('📝 Creating order:', req.body);
    const { customer_name, products, address, total, status = 'pending' } = req.body;
    
    if (dbConnected) {
      const result = await pool.query(
        'INSERT INTO orders (customer_name, products, address, total, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [customer_name, JSON.stringify(products), address, parseFloat(total), status]
      );
      console.log('✅ Order created in database');
      res.json(result.rows[0]);
    } else {
      const newOrder = {
        id: Date.now(),
        customer_name,
        products,
        address,
        total: parseFloat(total),
        status,
        created_at: new Date().toISOString()
      };
      
      memoryOrders.push(newOrder);
      console.log('✅ Order created in memory');
      res.json(newOrder);
    }
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Error creando pedido: ' + error.message });
  }
});

// Ruta para actualizar stock por sucursal
app.put('/api/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_principal, stock_higuey } = req.body;
    
    console.log(`📦 Updating stock for product ${id}:`, { stock_principal, stock_higuey });
    
    if (dbConnected) {
      // Actualizar stock en ambas sucursales
      await pool.query(
        'UPDATE inventarios SET cantidad = $1 WHERE id_articulo = $2 AND sucursal_id = 1',
        [parseInt(stock_principal) || 0, id]
      );
      
      await pool.query(
        'UPDATE inventarios SET cantidad = $1 WHERE id_articulo = $2 AND sucursal_id = 2',
        [parseInt(stock_higuey) || 0, id]
      );
      
      // Si no existe el inventario, insertarlo
      await pool.query(`
        INSERT INTO inventarios (id_articulo, sucursal_id, cantidad)
        VALUES ($1, 1, $2)
        ON CONFLICT (id_articulo, sucursal_id)
        DO UPDATE SET cantidad = $2
      `, [id, parseInt(stock_principal) || 0]);
      
      await pool.query(`
        INSERT INTO inventarios (id_articulo, sucursal_id, cantidad)
        VALUES ($1, 2, $2)
        ON CONFLICT (id_articulo, sucursal_id)
        DO UPDATE SET cantidad = $2
      `, [id, parseInt(stock_higuey) || 0]);
      
      // Obtener el producto actualizado
      const result = await pool.query(
        `SELECT 
          p.id_articulo AS id, 
          p.nombre AS name, 
          p.descripcion AS description, 
          p.costo AS price,
          p.categoria AS category,
          COALESCE(SUM(i.cantidad), 0) AS stock,
          STRING_AGG(
            s.nombre || ': ' || COALESCE(i.cantidad, 0), 
            ', ' ORDER BY s.nombre
          ) AS stock_detail,
          p.created_at, 
          p.updated_at
         FROM productos p
         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
         LEFT JOIN sucursales s ON i.sucursal_id = s.id
         WHERE p.id_articulo = $1
         GROUP BY p.id_articulo, p.nombre, p.descripcion, p.costo, p.categoria, p.created_at, p.updated_at`,
        [id]
      );
      
      console.log('✅ Stock updated in database');
      res.json(result.rows[0]);
    } else {
      // Actualizar en memoria
      const productIndex = memoryProducts.findIndex(p => p.id == id);
      if (productIndex === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      const totalStock = (parseInt(stock_principal) || 0) + (parseInt(stock_higuey) || 0);
      
      memoryProducts[productIndex].stock = totalStock;
      memoryProducts[productIndex].stock_detail = `Principal: ${stock_principal || 0}, Higüey: ${stock_higuey || 0}`;
      memoryProducts[productIndex].stock_by_branch = {
        'Principal': parseInt(stock_principal) || 0,
        'Higüey': parseInt(stock_higuey) || 0
      };
      
      console.log('✅ Stock updated in memory');
      res.json(memoryProducts[productIndex]);
    }
  } catch (error) {
    console.error('❌ Error updating stock:', error);
    res.status(500).json({ error: 'Error actualizando stock: ' + error.message });
  }
});

// Ruta de estadísticas
app.get('/api/stats', async (req, res) => {
  try {
    console.log('📊 Getting stats...');
    
    if (dbConnected) {
      const [productsCount, productsValue, ordersCount, salesTotal] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM productos WHERE activo = TRUE'),
        pool.query('SELECT COALESCE(SUM(p.costo * i.cantidad), 0) as total_value FROM productos p LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo WHERE p.activo = TRUE'),
        pool.query('SELECT COUNT(*) FROM orders'),
        pool.query('SELECT COALESCE(SUM(total), 0) as total_sales FROM orders')
      ]);

      const stats = {
        totalProducts: parseInt(productsCount.rows[0].count),
        totalValue: parseFloat(productsValue.rows[0].total_value || 0),
        totalOrders: parseInt(ordersCount.rows[0].count),
        totalSales: parseFloat(salesTotal.rows[0].total_sales || 0)
      };
      
      console.log('✅ Stats from database:', stats);
      res.json(stats);
    } else {
      const stats = {
        totalProducts: memoryProducts.length,
        totalValue: memoryProducts.reduce((sum, p) => sum + (p.price * p.stock), 0),
        totalOrders: memoryOrders.length,
        totalSales: memoryOrders.reduce((sum, o) => sum + o.total, 0)
      };
      
      console.log('✅ Stats from memory:', stats);
      res.json(stats);
    }
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas: ' + error.message });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión de Productos',
    database: dbConnected ? 'PostgreSQL' : 'Memory Storage',
    status: 'Running',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/products',
      'POST /api/products',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /api/orders',
      'POST /api/orders',
      'GET /api/stats'
    ],
    sampleProducts: memoryProducts.length
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
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
    
    // Solo inicializar DB si está conectada
    if (dbConnected) {
      await initDatabase();
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: ${dbConnected ? 'PostgreSQL' : 'Memory Storage'}`);
      console.log('🔐 Login: admin / admin123');
      console.log(`📦 Productos disponibles: ${memoryProducts.length}`);
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

// Iniciar servidor
startServer().catch(console.error);
