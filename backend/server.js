// server.js - Servidor completo con PostgreSQL y Paginación
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3053;

// Configuración de PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'product_management',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin123'
});

// Variable para trackear si las funciones están disponibles
let functionsAvailable = {
  obtener_estadisticas: false,
  buscar_productos: false,
  obtener_stock_total: false,
  actualizar_inventario: false
};

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Database connection test y verificación de funciones
async function testDBConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    
    // Verificar funciones disponibles
    await checkAvailableFunctions(client);
    
    client.release();
    console.log('✅ PostgreSQL conectado exitosamente');
    console.log('📋 Funciones disponibles:', functionsAvailable);
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
}

// Verificar qué funciones están disponibles
async function checkAvailableFunctions(client) {
  const functions = ['obtener_estadisticas', 'buscar_productos', 'obtener_stock_total', 'actualizar_inventario'];
  
  for (const func of functions) {
    try {
      const result = await client.query(
        'SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1) as exists',
        [func]
      );
      functionsAvailable[func] = result.rows[0].exists;
    } catch (error) {
      functionsAvailable[func] = false;
    }
  }
}

// Helper function para ejecutar queries
async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function para verificar si la base de datos está inicializada
async function ensureBasicTables() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS productos (
        id_articulo SERIAL PRIMARY KEY,
        numero_articulo VARCHAR(50),
        nombre VARCHAR(255) NOT NULL,
        categoria VARCHAR(100),
        costo DECIMAL(10,2) DEFAULT 0,
        precio DECIMAL(10,2) DEFAULT 0,
        descripcion TEXT,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS sucursales (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        codigo VARCHAR(20),
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS inventarios (
        id SERIAL PRIMARY KEY,
        id_articulo INT NOT NULL,
        sucursal_id INT NOT NULL,
        cantidad INT DEFAULT 0,
        cantidad_anterior INT DEFAULT 0,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id_articulo, sucursal_id)
      )
    `);
    
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(255) NOT NULL,
        direccion TEXT,
        total DECIMAL(10,2) NOT NULL,
        estado VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS pedido_detalles (
        id SERIAL PRIMARY KEY,
        pedido_id INT NOT NULL,
        id_articulo INT NOT NULL,
        cantidad INT NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL
      )
    `);
    
    // Insertar sucursales básicas si no existen
    await executeQuery(`
      INSERT INTO sucursales (nombre, codigo) 
      SELECT 'PRINCIPAL', 'PRIN'
      WHERE NOT EXISTS (SELECT 1 FROM sucursales WHERE codigo = 'PRIN')
    `);
    
    await executeQuery(`
      INSERT INTO sucursales (nombre, codigo) 
      SELECT 'SUCURSAL HIGÜEY', 'HIG'
      WHERE NOT EXISTS (SELECT 1 FROM sucursales WHERE codigo = 'HIG')
    `);
    
    console.log('✅ Tablas básicas verificadas/creadas');
  } catch (error) {
    console.error('❌ Error creando tablas básicas:', error);
  }
}

// Rutas básicas
app.get('/api/health', async (req, res) => {
  console.log('✅ Health check requested');
  
  try {
    await executeQuery('SELECT NOW()');
    
    let stats = {};
    if (functionsAvailable.obtener_estadisticas) {
      try {
        const statsResult = await executeQuery('SELECT obtener_estadisticas() as stats');
        stats = statsResult.rows[0].stats;
      } catch (error) {
        console.log('⚠️ Función obtener_estadisticas falló, usando fallback');
        functionsAvailable.obtener_estadisticas = false;
        stats = await getStatsWithFallback();
      }
    } else {
      stats = await getStatsWithFallback();
    }
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      message: 'Backend funcionando correctamente con PostgreSQL y Paginación',
      database: 'Connected',
      functions_available: functionsAvailable,
      stats: stats
    });
  } catch (error) {
    console.error('❌ Error en health check:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Error conectando a la base de datos',
      error: error.message,
      functions_available: functionsAvailable
    });
  }
});

// Fallback para estadísticas sin función personalizada
async function getStatsWithFallback() {
  try {
    const productStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_productos,
        COUNT(*) FILTER (WHERE activo = true) as productos_activos,
        COUNT(*) FILTER (WHERE activo = false) as productos_inactivos,
        COUNT(DISTINCT categoria) as categorias_distintas,
        COALESCE(SUM(precio), 0) as valor_basico
      FROM productos
    `);
    
    const inventoryStats = await executeQuery(`
      SELECT COALESCE(SUM(cantidad), 0) as stock_total_sistema
      FROM inventarios
    `);
    
    const stats = productStats.rows[0];
    const inventory = inventoryStats.rows[0];
    
    return {
      total_productos: parseInt(stats.total_productos) || 0,
      productos_activos: parseInt(stats.productos_activos) || 0,
      productos_inactivos: parseInt(stats.productos_inactivos) || 0,
      categorias_distintas: parseInt(stats.categorias_distintas) || 0,
      stock_total_sistema: parseInt(inventory.stock_total_sistema) || 0,
      valor_total_inventario: parseFloat(stats.valor_basico) || 0,
      valor_inventario_activo: parseFloat(stats.valor_basico) || 0
    };
  } catch (error) {
    console.error('❌ Error en fallback de estadísticas:', error);
    return {
      total_productos: 0,
      productos_activos: 0,
      productos_inactivos: 0,
      categorias_distintas: 0,
      stock_total_sistema: 0,
      valor_total_inventario: 0,
      valor_inventario_activo: 0
    };
  }
}

// ==================== AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Login attempt:', req.body);
  
  try {
    const { username, password } = req.body;
    
    // Verificar conexión a BD primero
    await executeQuery('SELECT 1');
    
    // Autenticación simple (mejorar en producción)
    if (username === 'admin' && password === 'admin123') {
      console.log('✅ Login successful');
      res.json({
        success: true,
        user: {
          id: 1,
          username: 'admin',
          role: 'admin'
        }
      });
    } else {
      console.log('❌ Login failed');
      res.status(401).json({ error: 'Credenciales incorrectas' });
    }
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error de conexión a la base de datos' });
  }
});

// ==================== PRODUCTOS CON PAGINACIÓN ====================
app.get('/api/products', async (req, res) => {
  console.log('📦 Getting products with pagination...');
  
  try {
    const { 
      search = '', 
      status = '', 
      category = '',
      page = 1,
      limit = 10,
      sort_by = 'nombre',
      sort_order = 'ASC'
    } = req.query;
    
    // Validar parámetros
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Máximo 100 por página
    const offset = (pageNum - 1) * limitNum;
    
    // Validar campos de ordenamiento
    const validSortFields = ['nombre', 'precio', 'categoria', 'created_at', 'stock_total', 'id_articulo'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'nombre';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    const result = await getProductsWithPagination(search, status, category, pageNum, limitNum, sortField, sortDirection);
    
    // Formatear datos para el frontend
    const formattedProducts = result.products.map(row => ({
      id: row.id_articulo,
      name: row.nombre,
      description: row.descripcion || '',
      price: parseFloat(row.precio) || 0,
      stock: parseInt(row.stock_total) || 0,
      stock_detail: row.stock_por_sucursal || 'Sin stock',
      category: row.categoria || 'Sin categoría',
      active: row.activo,
      created_at: row.created_at
    }));
    
    // Calcular información de paginación
    const totalPages = Math.ceil(result.totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;
    
    console.log(`✅ Returning ${formattedProducts.length} of ${result.totalCount} products (page ${pageNum}/${totalPages})`);
    
    res.json({
      products: formattedProducts,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        per_page: limitNum,
        total_items: result.totalCount,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
        next_page: hasNextPage ? pageNum + 1 : null,
        prev_page: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search,
        status,
        category,
        sort_by: sortField,
        sort_order: sortDirection
      }
    });
  } catch (error) {
    console.error('❌ Error getting products:', error);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

// Fallback para obtener productos con paginación
async function getProductsWithPagination(search, status, category, page, limit, sortField, sortDirection) {
  try {
    let countQuery = `
      SELECT COUNT(DISTINCT p.id_articulo) as total
      FROM productos p
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
      LEFT JOIN sucursales s ON i.sucursal_id = s.id AND s.activa = TRUE
      WHERE 1=1
    `;
    
    let dataQuery = `
      SELECT 
        p.id_articulo,
        p.numero_articulo,
        p.nombre,
        p.categoria,
        p.precio,
        p.descripcion,
        p.activo,
        COALESCE(SUM(i.cantidad), 0) as stock_total,
        STRING_AGG(
          s.nombre || ': ' || COALESCE(i.cantidad, 0), 
          ', ' ORDER BY s.nombre
        ) as stock_por_sucursal,
        p.created_at,
        p.updated_at
      FROM productos p
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
      LEFT JOIN sucursales s ON i.sucursal_id = s.id AND s.activa = TRUE
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Construir filtros
    let filterClause = '';
    
    // Filtro de búsqueda
    if (search) {
      filterClause += ` AND (
        LOWER(p.nombre) LIKE LOWER($${paramIndex}) OR
        LOWER(p.descripcion) LIKE LOWER($${paramIndex}) OR
        LOWER(p.categoria) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Filtro de categoría
    if (category) {
      filterClause += ` AND p.categoria = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    // Filtro de estado
    if (status === 'active') {
      filterClause += ` AND p.activo = true`;
    } else if (status === 'inactive') {
      filterClause += ` AND p.activo = false`;
    }
    
    // Aplicar filtros a ambas queries
    countQuery += filterClause;
    dataQuery += filterClause;
    
    // Obtener count total
    const countResult = await executeQuery(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Agregar GROUP BY, ORDER BY y LIMIT a la query de datos
    const orderByClause = sortField === 'stock_total' ? 'COALESCE(SUM(i.cantidad), 0)' : 'p.' + sortField;
    
    dataQuery += `
      GROUP BY p.id_articulo, p.numero_articulo, p.nombre, p.categoria, 
               p.precio, p.descripcion, p.activo, p.created_at, p.updated_at
      ORDER BY ${orderByClause} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, (page - 1) * limit);
    
    // Obtener datos paginados
    const dataResult = await executeQuery(dataQuery, params);
    
    return {
      products: dataResult.rows,
      totalCount: totalCount
    };
  } catch (error) {
    console.error('❌ Error en fallback de productos paginados:', error);
    return { products: [], totalCount: 0 };
  }
}

app.post('/api/products', async (req, res) => {
  console.log('📝 Creating product:', req.body);
  
  try {
    const { 
      name, 
      description = '', 
      price, 
      stock = 0, 
      category = '',
      branch = 'PRINCIPAL'
    } = req.body;
    
    // Validaciones básicas
    if (!name || !price) {
      return res.status(400).json({ error: 'Nombre y precio son requeridos' });
    }
    
    // Insertar producto
    const productResult = await executeQuery(
      `INSERT INTO productos (nombre, descripcion, precio, categoria, activo) 
       VALUES ($1, $2, $3, $4, true) 
       RETURNING id_articulo, nombre, descripcion, precio, categoria, activo, created_at`,
      [name, description, parseFloat(price), category]
    );
    
    const newProduct = productResult.rows[0];
    
    // Si se especifica stock, agregarlo a la sucursal
    if (stock > 0) {
      try {
        const sucursalResult = await executeQuery(
          'SELECT id FROM sucursales WHERE nombre = $1',
          [branch]
        );
        
        if (sucursalResult.rows.length > 0) {
          const sucursalId = sucursalResult.rows[0].id;
          await updateInventoryWithFallback(newProduct.id_articulo, sucursalId, parseInt(stock));
        }
      } catch (error) {
        console.warn('⚠️ Error agregando inventario inicial:', error);
      }
    }
    
    // Retornar producto formateado
    const formattedProduct = {
      id: newProduct.id_articulo,
      name: newProduct.nombre,
      description: newProduct.descripcion,
      price: parseFloat(newProduct.precio),
      stock: parseInt(stock),
      stock_detail: `${branch}: ${stock}`,
      category: newProduct.categoria,
      active: newProduct.activo,
      created_at: newProduct.created_at
    };
    
    console.log('✅ Product created');
    res.json(formattedProduct);
  } catch (error) {
    console.error('❌ Error creating product:', error);
    res.status(500).json({ error: 'Error creando producto' });
  }
});

// Fallback para actualizar inventario
async function updateInventoryWithFallback(productId, sucursalId, cantidad) {
  try {
    await executeQuery(`
      INSERT INTO inventarios (id_articulo, sucursal_id, cantidad, cantidad_anterior)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (id_articulo, sucursal_id) 
      DO UPDATE SET 
        cantidad_anterior = inventarios.cantidad,
        cantidad = $3,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `, [productId, sucursalId, cantidad]);
  } catch (error) {
    console.error('❌ Error en fallback de inventario:', error);
    throw error;
  }
}

app.patch('/api/products/:id/status', async (req, res) => {
  console.log(`🔄 Updating product ${req.params.id} status`);
  
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    const result = await executeQuery(
      `UPDATE productos 
       SET activo = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id_articulo = $2 
       RETURNING *`,
      [Boolean(active), parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const updatedProduct = result.rows[0];
    
    console.log(`✅ Product ${id} status updated to: ${updatedProduct.activo}`);
    res.json({ 
      success: true, 
      message: `Producto ${active ? 'activado' : 'desactivado'} correctamente`,
      product: {
        id: updatedProduct.id_articulo,
        active: updatedProduct.activo
      }
    });
  } catch (error) {
    console.error('❌ Error updating product status:', error);
    res.status(500).json({ error: 'Error actualizando estado del producto' });
  }
});

// ==================== PEDIDOS CON PAGINACIÓN ====================
app.get('/api/orders', async (req, res) => {
  console.log('🛒 Getting orders with pagination...');
  
  try {
    const { 
      page = 1,
      limit = 10,
      status = '',
      customer = '',
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    // Validar parámetros
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    // Validar campos de ordenamiento
    const validSortFields = ['created_at', 'total', 'cliente_nombre', 'estado', 'id'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    // Query para obtener el count total
    let countQuery = `
      SELECT COUNT(*) as total
      FROM pedidos p
      WHERE 1=1
    `;
    
    // Query para obtener los datos
    let dataQuery = `
      SELECT p.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'name', pr.nombre,
                   'quantity', pd.cantidad,
                   'price', pd.precio_unitario
                 )
               ) FILTER (WHERE pd.id IS NOT NULL), 
               '[]'::json
             ) as products
      FROM pedidos p
      LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id
      LEFT JOIN productos pr ON pd.id_articulo = pr.id_articulo
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Construir filtros
    let filterClause = '';
    
    // Filtro por estado
    if (status) {
      filterClause += ` AND p.estado = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    // Filtro por cliente
    if (customer) {
      filterClause += ` AND LOWER(p.cliente_nombre) LIKE LOWER($${paramIndex})`;
      params.push(`%${customer}%`);
      paramIndex++;
    }
    
    // Aplicar filtros
    countQuery += filterClause;
    dataQuery += filterClause;
    
    // Obtener count total
    const countResult = await executeQuery(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Completar query de datos
    dataQuery += `
      GROUP BY p.id, p.cliente_nombre, p.direccion, p.total, p.estado, p.created_at, p.updated_at
      ORDER BY p.${sortField} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limitNum, offset);
    
    // Obtener datos paginados
    const dataResult = await executeQuery(dataQuery, params);
    
    const orders = dataResult.rows.map(row => ({
      id: row.id,
      customer_name: row.cliente_nombre,
      address: row.direccion,
      total: parseFloat(row.total),
      status: row.estado,
      products: row.products || [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    // Calcular información de paginación
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;
    
    console.log(`✅ Returning ${orders.length} of ${totalCount} orders (page ${pageNum}/${totalPages})`);
    
    res.json({
      orders: orders,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        per_page: limitNum,
        total_items: totalCount,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
        next_page: hasNextPage ? pageNum + 1 : null,
        prev_page: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        status,
        customer,
        sort_by: sortField,
        sort_order: sortDirection
      }
    });
  } catch (error) {
    console.error('❌ Error getting orders:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

// ==================== ESTADÍSTICAS ====================
app.get('/api/stats', async (req, res) => {
  console.log('📊 Getting stats...');
  
  try {
    let productStats = {};
    
    // Obtener estadísticas de productos
    if (functionsAvailable.obtener_estadisticas) {
      try {
        const productStatsResult = await executeQuery('SELECT obtener_estadisticas() as stats');
        productStats = productStatsResult.rows[0].stats;
      } catch (error) {
        console.log('⚠️ Función obtener_estadisticas falló, usando fallback');
        functionsAvailable.obtener_estadisticas = false;
        productStats = await getStatsWithFallback();
      }
    } else {
      productStats = await getStatsWithFallback();
    }
    
    // Obtener estadísticas de pedidos
    const orderStatsResult = await executeQuery(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_sales,
        COUNT(*) FILTER (WHERE estado = 'completed') as completed_orders,
        COUNT(*) FILTER (WHERE estado = 'pending') as pending_orders
      FROM pedidos
    `);
    
    const orderStats = orderStatsResult.rows[0];
    
    const stats = {
      // Estadísticas de productos
      totalProducts: productStats.total_productos || 0,
      activeProducts: productStats.productos_activos || 0,
      inactiveProducts: productStats.productos_inactivos || 0,
      totalValue: productStats.valor_total_inventario || 0,
      activeValue: productStats.valor_inventario_activo || 0,
      categoriesCount: productStats.categorias_distintas || 0,
      totalStock: productStats.stock_total_sistema || 0,
      
      // Estadísticas de pedidos
      totalOrders: parseInt(orderStats.total_orders) || 0,
      totalSales: parseFloat(orderStats.total_sales) || 0,
      completedOrders: parseInt(orderStats.completed_orders) || 0,
      pendingOrders: parseInt(orderStats.pending_orders) || 0
    };
    
    console.log('✅ Stats calculated:', stats);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ==================== REPORTES CON PAGINACIÓN ====================
app.get('/api/reports/low-stock', async (req, res) => {
  console.log('📊 Getting low stock report with pagination...');
  
  try {
    const { 
      page = 1,
      limit = 20,
      branch = '',
      sort_by = 'cantidad',
      sort_order = 'ASC'
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    // Query base
    let baseQuery = `
      SELECT 
        p.id_articulo,
        p.nombre,
        s.nombre as sucursal,
        COALESCE(i.cantidad, 0) as cantidad,
        CASE 
          WHEN COALESCE(i.cantidad, 0) = 0 THEN 'SIN STOCK'
          WHEN COALESCE(i.cantidad, 0) <= 5 THEN 'STOCK BAJO'
          WHEN COALESCE(i.cantidad, 0) <= 10 THEN 'STOCK MEDIO'
          ELSE 'OK'
        END as estado_stock
      FROM productos p
      CROSS JOIN sucursales s
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo AND s.id = i.sucursal_id
      WHERE p.activo = TRUE AND s.activa = TRUE
        AND COALESCE(i.cantidad, 0) <= 10
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Filtro por sucursal
    if (branch) {
      baseQuery += ` AND s.nombre = $${paramIndex}`;
      params.push(branch);
      paramIndex++;
    }
    
    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as counted`;
    const countResult = await executeQuery(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Data query con ordenamiento y paginación
    const validSortFields = ['cantidad', 'nombre', 'sucursal'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'cantidad';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    const dataQuery = `${baseQuery} ORDER BY ${sortField} ${sortDirection} LIMIT ${paramIndex} OFFSET ${paramIndex + 1}`;
    params.push(limitNum, offset);
    
    const dataResult = await executeQuery(dataQuery, params);
    
    const lowStockProducts = dataResult.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      branch: row.sucursal,
      current_stock: row.cantidad,
      stock_status: row.estado_stock
    }));
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      low_stock_products: lowStockProducts,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        per_page: limitNum,
        total_items: totalCount,
        has_next_page: pageNum < totalPages,
        has_prev_page: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error getting low stock report:', error);
    res.status(500).json({ error: 'Error obteniendo reporte de bajo stock' });
  }
});

// ==================== SUCURSALES ====================
app.get('/api/branches', async (req, res) => {
  console.log('🏪 Getting branches...');
  
  try {
    const result = await executeQuery('SELECT * FROM sucursales WHERE activa = true ORDER BY nombre');
    
    const branches = result.rows.map(row => ({
      id: row.id,
      name: row.nombre,
      code: row.codigo,
      active: row.activa,
      created_at: row.created_at
    }));
    
    res.json(branches);
  } catch (error) {
    console.error('❌ Error getting branches:', error);
    res.status(500).json({ error: 'Error obteniendo sucursales' });
  }
});

// ==================== RUTAS GENERALES ====================
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión funcionando con PostgreSQL y Paginación',
    status: 'OK',
    version: '3.2.0',
    database: 'PostgreSQL',
    functions_available: functionsAvailable,
    features: [
      'Gestión de productos con estado activo/inactivo',
      'Control de inventario por sucursal',
      'Gestión de pedidos con detalles',
      'Reportes de stock bajo y valor de inventario',
      'Estadísticas detalladas',
      'Paginación completa en todos los endpoints',
      'Búsqueda y filtros avanzados',
      'Ordenamiento por columnas',
      'Base de datos PostgreSQL con fallbacks robustos'
    ],
    endpoints: [
      'GET /api/health - Estado del sistema y funciones',
      'POST /api/auth/login - Autenticación',
      'GET /api/products?page=1&limit=10&search=&status=&category=&sort_by=nombre&sort_order=ASC - Productos paginados',
      'POST /api/products - Crear producto',
      'PATCH /api/products/:id/status - Cambiar estado activo/inactivo',
      'GET /api/orders?page=1&limit=10&customer=&status=&sort_by=created_at&sort_order=DESC - Pedidos paginados',
      'GET /api/stats - Estadísticas generales',
      'GET /api/branches - Listar sucursales',
      'GET /api/reports/low-stock?page=1&limit=20&branch=&sort_by=cantidad&sort_order=ASC - Reporte paginado'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// 404
app.use('*', (req, res) => {
  console.log('❌ 404 Not Found:', req.path);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
async function startServer() {
  try {
    // Verificar y crear tablas básicas
    await ensureBasicTables();
    
    // Probar conexión a la base de datos
    const dbConnected = await testDBConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a PostgreSQL. Verificar configuración.');
      console.log('💡 Tip: Ejecuta el script de migración primero:');
      console.log('   psql -h localhost -U admin -d product_management -f database_migration_fix.sql');
      process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND COMPLETO CON PAGINACIÓN INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API Local: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: PostgreSQL`);
      console.log(`📊 Host DB: ${process.env.DB_HOST || 'localhost'}`);
      console.log(`🔐 Login: admin / admin123`);
      console.log('✨ Funcionalidades disponibles:');
      console.log('   • Gestión de productos normalizada con paginación');
      console.log('   • Control de inventario por sucursal');
      console.log('   • Sistema de pedidos completo con paginación');
      console.log('   • Reportes paginados y estadísticas avanzadas');
      console.log('   • Búsqueda y filtros en tiempo real');
      console.log('   • Ordenamiento por columnas');
      console.log('   • Fallbacks robustos para funciones faltantes');
      console.log('   • Auto-detección de capacidades de BD');
      console.log('📋 Estado de funciones PostgreSQL:');
      Object.entries(functionsAvailable).forEach(([func, available]) => {
        console.log(`   ${available ? '✅' : '❌'} ${func}`);
      });
      console.log('🔄 Ejemplos de URLs con paginación:');
      console.log('   • GET /api/products?page=2&limit=25&search=laptop&status=active');
      console.log('   • GET /api/orders?page=1&limit=10&customer=juan&sort_by=total&sort_order=DESC');
      console.log('   • GET /api/reports/low-stock?page=1&limit=20&branch=PRINCIPAL');
      console.log('=================================');
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('🔄 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

console.log('🔄 Iniciando servidor completo con PostgreSQL y Paginación...');
startServer();
