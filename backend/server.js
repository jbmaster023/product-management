// server.js - Backend Node.js con PostgreSQL
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


// Test de conexión a PostgreSQL
async function testDatabaseConnection() {
  try {
    console.log('🔄 Testing PostgreSQL connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    dbConnected = true;
    console.log('✅ PostgreSQL connected successfully:', result.rows[0].now);
  } catch (error) {
    dbConnected = false;
    console.error('❌ PostgreSQL connection failed:', error.message);
    throw error;
  }
}

// Inicializar base de datos PostgreSQL
async function initDatabase() {
  
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


    await pool.query('CREATE INDEX IF NOT EXISTS idx_inventarios_articulo ON inventarios(id_articulo);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inventarios_sucursal ON inventarios(sucursal_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inventarios_cantidad ON inventarios(cantidad);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);');

    await pool.query("COMMENT ON TABLE productos IS 'Tabla de productos';");
    await pool.query("COMMENT ON COLUMN productos.id_articulo IS 'ID único del artículo';");
    await pool.query("COMMENT ON COLUMN productos.numero_articulo IS 'Código interno del artículo';");
    await pool.query("COMMENT ON COLUMN productos.costo IS 'Costo del producto en moneda local';");
    await pool.query("COMMENT ON COLUMN productos.activo IS 'Estado del producto: true=activo, false=inactivo';");

    await pool.query(`
      CREATE VIEW IF NOT EXISTS vista_inventario_completo AS
      SELECT 
          p.id_articulo,
          p.numero_articulo,
          p.nombre,
          p.categoria,
          p.costo,
          p.descripcion,
          s.id as sucursal_id,
          s.nombre as sucursal_nombre,
          s.codigo as sucursal_codigo,
          COALESCE(i.cantidad, 0) as cantidad_actual,
          i.cantidad_anterior,
          i.fecha_actualizacion
      FROM productos p
      CROSS JOIN sucursales s
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo AND s.id = i.sucursal_id
      WHERE p.activo = TRUE AND s.activa = TRUE
      ORDER BY p.nombre, s.nombre;
    `);

    await pool.query(`
      CREATE OR REPLACE FUNCTION actualizar_inventario(
          p_id_articulo INT,
          p_sucursal_id INT,
          p_nueva_cantidad INT
      ) RETURNS VOID AS $$
      BEGIN
          INSERT INTO inventarios (id_articulo, sucursal_id, cantidad, cantidad_anterior)
          VALUES (p_id_articulo, p_sucursal_id, p_nueva_cantidad, 0)
          ON CONFLICT (id_articulo, sucursal_id) 
          DO UPDATE SET 
              cantidad_anterior = inventarios.cantidad,
              cantidad = p_nueva_cantidad,
              fecha_actualizacion = CURRENT_TIMESTAMP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      CREATE VIEW IF NOT EXISTS resumen_inventario_por_producto AS
      SELECT 
          p.id_articulo,
          p.nombre,
          p.categoria,
          SUM(COALESCE(i.cantidad, 0)) as total_stock,
          COUNT(i.sucursal_id) as sucursales_con_stock,
          STRING_AGG(s.nombre || ': ' || COALESCE(i.cantidad, 0), ', ') as detalle_por_sucursal
      FROM productos p
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
      LEFT JOIN sucursales s ON i.sucursal_id = s.id
      WHERE p.activo = TRUE
      GROUP BY p.id_articulo, p.nombre, p.categoria
      ORDER BY total_stock DESC;
    `);

    await pool.query(`
      CREATE VIEW IF NOT EXISTS productos_bajo_stock AS
      SELECT 
          p.nombre,
          s.nombre as sucursal,
          COALESCE(i.cantidad, 0) as cantidad,
          CASE 
              WHEN COALESCE(i.cantidad, 0) = 0 THEN 'SIN STOCK'
              WHEN COALESCE(i.cantidad, 0) <= 5 THEN 'STOCK BAJO'
              ELSE 'OK'
          END as estado_stock
      FROM productos p
      CROSS JOIN sucursales s
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo AND s.id = i.sucursal_id
      WHERE p.activo = TRUE AND s.activa = TRUE
          AND COALESCE(i.cantidad, 0) <= 10
      ORDER BY cantidad ASC, p.nombre;
    `);

    await pool.query(`
      CREATE VIEW IF NOT EXISTS diferencias_stock_sucursales AS
      SELECT 
          p.nombre as producto,
          MAX(CASE WHEN s.id = 1 THEN COALESCE(i.cantidad, 0) END) as stock_principal,
          MAX(CASE WHEN s.id = 2 THEN COALESCE(i.cantidad, 0) END) as stock_higuey,
          ABS(
              MAX(CASE WHEN s.id = 1 THEN COALESCE(i.cantidad, 0) END) - 
              MAX(CASE WHEN s.id = 2 THEN COALESCE(i.cantidad, 0) END)
          ) as diferencia
      FROM productos p
      CROSS JOIN sucursales s
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo AND s.id = i.sucursal_id
      WHERE p.activo = TRUE AND s.activa = TRUE
      GROUP BY p.id_articulo, p.nombre
      HAVING ABS(
          MAX(CASE WHEN s.id = 1 THEN COALESCE(i.cantidad, 0) END) - 
          MAX(CASE WHEN s.id = 2 THEN COALESCE(i.cantidad, 0) END)
      ) > 0
      ORDER BY diferencia DESC;
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


    console.log('🎉 PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing PostgreSQL:', error);
    dbConnected = false;
  }
}

// Rutas de salud
app.get('/api/health', async (req, res) => {
  const dbStatus = dbConnected ? 'PostgreSQL Connected' : 'Not Connected';

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
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// Rutas de productos
app.get('/api/products', async (req, res) => {
  try {
    const search = req.query.search || '';
    if (dbConnected) {
      const baseQuery = `SELECT p.id_articulo AS id, p.nombre AS name, p.descripcion AS description,
                                p.costo AS price, COALESCE(SUM(i.cantidad),0) AS stock,
                                p.categoria AS category, '' AS branch,
                                p.created_at, p.updated_at
                         FROM productos p
                         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo`;
      if (search) {
        const result = await pool.query(
          baseQuery + ' WHERE p.nombre ILIKE $1 OR p.descripcion ILIKE $1 GROUP BY p.id_articulo ORDER BY p.created_at DESC',
          [`%${search}%`]
        );
        res.json(result.rows);
      } else {
        const result = await pool.query(
          baseQuery + ' GROUP BY p.id_articulo ORDER BY p.created_at DESC'
        );
        res.json(result.rows);
      }
      }
    } catch (error) {
      console.error('Error getting products:', error);
      res.status(500).json({ error: 'Error obteniendo productos' });
    }
  });

app.post('/api/products', async (req, res) => {
  try {
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
      await pool.query('SELECT actualizar_inventario($1, 1, $2)', [idArticulo, parseInt(stock)]);
      const result = await pool.query(
        `SELECT p.id_articulo AS id, p.nombre AS name, p.descripcion AS description, p.costo AS price,
                COALESCE(SUM(i.cantidad),0) AS stock, p.categoria AS category,
                p.created_at, p.updated_at
         FROM productos p
         LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
         WHERE p.id_articulo = $1
         GROUP BY p.id_articulo`,
        [idArticulo]
      );
      res.json(result.rows[0]);
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
        const result = await pool.query(
          'UPDATE productos SET nombre = $1, descripcion = $2, costo = $3, categoria = $4, updated_at = CURRENT_TIMESTAMP WHERE id_articulo = $5 RETURNING id_articulo',
          [name, description, parseFloat(price), category, id]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
        await pool.query('SELECT actualizar_inventario($1, 1, $2)', [id, parseInt(stock)]);
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
      res.json(updated.rows[0]);
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
        const result = await pool.query('DELETE FROM productos WHERE id_articulo = $1 RETURNING *', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
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
    }
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
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
          pool.query('SELECT COUNT(*) FROM productos'),
          pool.query('SELECT COALESCE(SUM(p.costo * i.cantidad), 0) as total_value FROM productos p LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo'),
        pool.query('SELECT COUNT(*) FROM orders'),
        pool.query('SELECT COALESCE(SUM(total), 0) as total_sales FROM orders')
      ]);

      res.json({
        totalProducts: parseInt(productsCount.rows[0].count),
        totalValue: parseFloat(productsValue.rows[0].total_value || 0),
        totalOrders: parseInt(ordersCount.rows[0].count),
        totalSales: parseFloat(salesTotal.rows[0].total_sales || 0)
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
    database: 'PostgreSQL',
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
    
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}/api`);
      console.log('🗄️ Base de datos: PostgreSQL');
      console.log('🔐 Login: admin / admin123');
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
