// server.js - Backend actualizado con PostgreSQL
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

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Database connection test
async function testDBConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL conectado exitosamente');
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
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

// Rutas básicas
app.get('/api/health', async (req, res) => {
  console.log('✅ Health check requested');
  
  try {
    // Verificar conexión a BD y obtener estadísticas básicas
    const statsResult = await executeQuery('SELECT obtener_estadisticas() as stats');
    const stats = statsResult.rows[0].stats;
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      message: 'Backend funcionando correctamente con PostgreSQL',
      database: 'Connected',
      stats: stats
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Error conectando a la base de datos',
      error: error.message
    });
  }
});

// ==================== AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Login attempt:', req.body);
  
  try {
    const { username, password } = req.body;
    
    // Por simplicidad, mantenemos la autenticación básica
    // En producción, usar bcrypt para las contraseñas
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
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ==================== PRODUCTOS ====================
app.get('/api/products', async (req, res) => {
  console.log('📦 Getting products...');
  
  try {
    const { search = '', status = '', category = '' } = req.query;
    
    // Usar la función de búsqueda personalizada
    const result = await executeQuery(
      'SELECT * FROM buscar_productos($1, $2, $3)',
      [search, category, status]
    );
    
    // Formatear datos para el frontend
    const products = result.rows.map(row => ({
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
    
    console.log(`✅ Returning ${products.length} products`);
    res.json(products);
  } catch (error) {
    console.error('❌ Error getting products:', error);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

app.post('/api/products', async (req, res) => {
  console.log('📝 Creating product:', req.body);
  
  try {
    const { 
      name, 
      description = '', 
      price, 
      stock = 0, 
      category = '',
      branch = 'Principal'
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
    
    // Si se especifica stock, agregarlo a las sucursales
    if (stock > 0) {
      // Obtener ID de la sucursal
      const sucursalResult = await executeQuery(
        'SELECT id FROM sucursales WHERE nombre = $1',
        [branch]
      );
      
      if (sucursalResult.rows.length > 0) {
        const sucursalId = sucursalResult.rows[0].id;
        
        // Agregar inventario
        await executeQuery(
          'SELECT actualizar_inventario($1, $2, $3)',
          [newProduct.id_articulo, sucursalId, parseInt(stock)]
        );
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

app.put('/api/products/:id', async (req, res) => {
  console.log(`📝 Updating product ${req.params.id}`);
  
  try {
    const { id } = req.params;
    const { name, description, price, category } = req.body;
    
    // Actualizar producto
    const result = await executeQuery(
      `UPDATE productos 
       SET nombre = $1, descripcion = $2, precio = $3, categoria = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id_articulo = $5 
       RETURNING *`,
      [name, description || '', parseFloat(price), category || '', parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const updatedProduct = result.rows[0];
    
    // Obtener stock total
    const stockResult = await executeQuery(
      'SELECT obtener_stock_total($1) as stock_total',
      [updatedProduct.id_articulo]
    );
    
    const formattedProduct = {
      id: updatedProduct.id_articulo,
      name: updatedProduct.nombre,
      description: updatedProduct.descripcion,
      price: parseFloat(updatedProduct.precio),
      stock: parseInt(stockResult.rows[0].stock_total) || 0,
      category: updatedProduct.categoria,
      active: updatedProduct.activo,
      updated_at: updatedProduct.updated_at
    };
    
    console.log('✅ Product updated');
    res.json(formattedProduct);
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ error: 'Error actualizando producto' });
  }
});

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

// Actualizar stock por sucursal
app.put('/api/products/:id/stock', async (req, res) => {
  console.log(`📦 Updating stock for product ${req.params.id}`);
  
  try {
    const { id } = req.params;
    const { stock_principal, stock_higuey } = req.body;
    
    // Actualizar stock en sucursal Principal
    if (stock_principal !== undefined) {
      await executeQuery(
        'SELECT actualizar_inventario($1, 1, $2)', // 1 = ID de sucursal Principal
        [parseInt(id), parseInt(stock_principal) || 0]
      );
    }
    
    // Actualizar stock en sucursal Higüey
    if (stock_higuey !== undefined) {
      await executeQuery(
        'SELECT actualizar_inventario($1, 2, $2)', // 2 = ID de sucursal Higüey
        [parseInt(id), parseInt(stock_higuey) || 0]
      );
    }
    
    // Obtener producto actualizado con stock
    const productResult = await executeQuery(
      'SELECT * FROM vista_productos_resumen WHERE id_articulo = $1',
      [parseInt(id)]
    );
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const product = productResult.rows[0];
    
    const formattedProduct = {
      id: product.id_articulo,
      name: product.nombre,
      description: product.descripcion,
      price: parseFloat(product.precio),
      stock: parseInt(product.stock_total) || 0,
      stock_detail: product.stock_por_sucursal,
      category: product.categoria,
      active: product.activo
    };
    
    console.log('✅ Stock updated');
    res.json(formattedProduct);
  } catch (error) {
    console.error('❌ Error updating stock:', error);
    res.status(500).json({ error: 'Error actualizando stock' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  console.log(`🗑️ Deleting product ${req.params.id}`);
  
  try {
    const { id } = req.params;
    
    const result = await executeQuery(
      'DELETE FROM productos WHERE id_articulo = $1 RETURNING *',
      [parseInt(id)]
    );
    
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

// ==================== PEDIDOS ====================
app.get('/api/orders', async (req, res) => {
  console.log('🛒 Getting orders...');
  
  try {
    const result = await executeQuery(`
      SELECT p.*, 
             json_agg(
               json_build_object(
                 'name', pr.nombre,
                 'quantity', pd.cantidad,
                 'price', pd.precio_unitario
               )
             ) as products
      FROM pedidos p
      LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id
      LEFT JOIN productos pr ON pd.id_articulo = pr.id_articulo
      GROUP BY p.id, p.cliente_nombre, p.direccion, p.total, p.estado, p.created_at
      ORDER BY p.created_at DESC
    `);
    
    const orders = result.rows.map(row => ({
      id: row.id,
      customer_name: row.cliente_nombre,
      address: row.direccion,
      total: parseFloat(row.total),
      status: row.estado,
      products: row.products || [],
      created_at: row.created_at
    }));
    
    res.json(orders);
  } catch (error) {
    console.error('❌ Error getting orders:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

app.post('/api/orders', async (req, res) => {
  console.log('📝 Creating order:', req.body);
  
  try {
    const { customer_name, products, address, total, status = 'pending' } = req.body;
    
    // Insertar pedido
    const orderResult = await executeQuery(
      `INSERT INTO pedidos (cliente_nombre, direccion, total, estado) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [customer_name, address, parseFloat(total), status]
    );
    
    const newOrder = orderResult.rows[0];
    
    // Insertar detalles del pedido
    if (products && products.length > 0) {
      for (const product of products) {
        await executeQuery(
          `INSERT INTO pedido_detalles (pedido_id, id_articulo, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            newOrder.id,
            product.id_articulo, // Asume que el frontend envía el ID del artículo
            product.quantity,
            product.price,
            product.quantity * product.price
          ]
        );
      }
    }
    
    const formattedOrder = {
      id: newOrder.id,
      customer_name: newOrder.cliente_nombre,
      products: products,
      address: newOrder.direccion,
      total: parseFloat(newOrder.total),
      status: newOrder.estado,
      created_at: newOrder.created_at
    };
    
    console.log('✅ Order created');
    res.json(formattedOrder);
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: 'Error creando pedido' });
  }
});

// ==================== ESTADÍSTICAS ====================
app.get('/api/stats', async (req, res) => {
  console.log('📊 Getting stats...');
  
  try {
    // Obtener estadísticas de productos
    const productStatsResult = await executeQuery('SELECT obtener_estadisticas() as stats');
    const productStats = productStatsResult.rows[0].stats;
    
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

// ==================== INVENTARIOS ====================
app.get('/api/inventory', async (req, res) => {
  console.log('📋 Getting inventory...');
  
  try {
    const result = await executeQuery('SELECT * FROM vista_inventario_completo ORDER BY nombre, sucursal_nombre');
    
    const inventory = result.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      branch_id: row.sucursal_id,
      branch_name: row.sucursal_nombre,
      branch_code: row.sucursal_codigo,
      current_stock: row.cantidad_actual,
      previous_stock: row.cantidad_anterior,
      last_updated: row.fecha_actualizacion,
      total_stock: row.stock_total
    }));
    
    res.json(inventory);
  } catch (error) {
    console.error('❌ Error getting inventory:', error);
    res.status(500).json({ error: 'Error obteniendo inventario' });
  }
});

// Obtener inventario por producto
app.get('/api/inventory/:productId', async (req, res) => {
  console.log(`📋 Getting inventory for product ${req.params.productId}`);
  
  try {
    const { productId } = req.params;
    
    const result = await executeQuery(
      'SELECT * FROM vista_inventario_completo WHERE id_articulo = $1 ORDER BY sucursal_nombre',
      [parseInt(productId)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const inventory = result.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      branch_id: row.sucursal_id,
      branch_name: row.sucursal_nombre,
      branch_code: row.sucursal_codigo,
      current_stock: row.cantidad_actual,
      previous_stock: row.cantidad_anterior,
      last_updated: row.fecha_actualizacion
    }));
    
    res.json(inventory);
  } catch (error) {
    console.error('❌ Error getting product inventory:', error);
    res.status(500).json({ error: 'Error obteniendo inventario del producto' });
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

// ==================== REPORTES ====================
app.get('/api/reports/low-stock', async (req, res) => {
  console.log('📊 Getting low stock report...');
  
  try {
    const result = await executeQuery('SELECT * FROM vista_productos_bajo_stock');
    
    const lowStockProducts = result.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      branch: row.sucursal,
      current_stock: row.cantidad,
      stock_status: row.estado_stock
    }));
    
    res.json(lowStockProducts);
  } catch (error) {
    console.error('❌ Error getting low stock report:', error);
    res.status(500).json({ error: 'Error obteniendo reporte de bajo stock' });
  }
});

app.get('/api/reports/inventory-value', async (req, res) => {
  console.log('💰 Getting inventory value report...');
  
  try {
    const result = await executeQuery(`
      SELECT 
        p.id_articulo,
        p.nombre,
        p.categoria,
        p.precio,
        obtener_stock_total(p.id_articulo) as stock_total,
        (p.precio * obtener_stock_total(p.id_articulo)) as valor_total
      FROM productos p
      WHERE p.activo = true
      ORDER BY valor_total DESC
    `);
    
    const inventoryValue = result.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      category: row.categoria,
      unit_price: parseFloat(row.precio),
      total_stock: parseInt(row.stock_total) || 0,
      total_value: parseFloat(row.valor_total) || 0
    }));
    
    res.json(inventoryValue);
  } catch (error) {
    console.error('❌ Error getting inventory value report:', error);
    res.status(500).json({ error: 'Error obteniendo reporte de valor de inventario' });
  }
});

// ==================== RUTAS GENERALES ====================
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión funcionando con PostgreSQL',
    status: 'OK',
    version: '3.0.0',
    database: 'PostgreSQL',
    features: [
      'Gestión de productos con estado activo/inactivo',
      'Control de inventario por sucursal',
      'Gestión de pedidos con detalles',
      'Reportes de stock bajo y valor de inventario',
      'Estadísticas detalladas',
      'Base de datos PostgreSQL normalizada'
    ],
    endpoints: [
      'GET /api/health - Estado del sistema',
      'POST /api/auth/login - Autenticación',
      'GET /api/products - Listar productos',
      'POST /api/products - Crear producto',
      'PUT /api/products/:id - Actualizar producto',
      'PATCH /api/products/:id/status - Cambiar estado activo/inactivo',
      'PUT /api/products/:id/stock - Actualizar stock por sucursal',
      'DELETE /api/products/:id - Eliminar producto',
      'GET /api/orders - Listar pedidos',
      'POST /api/orders - Crear pedido',
      'GET /api/stats - Estadísticas generales',
      'GET /api/inventory - Inventario completo',
      'GET /api/inventory/:productId - Inventario por producto',
      'GET /api/branches - Listar sucursales',
      'GET /api/reports/low-stock - Reporte de bajo stock',
      'GET /api/reports/inventory-value - Reporte de valor de inventario'
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
    // Probar conexión a la base de datos
    const dbConnected = await testDBConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a PostgreSQL. Verificar configuración.');
      process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 BACKEND CON POSTGRESQL INICIADO');
      console.log(`🌐 Puerto: ${PORT}`);
      console.log(`📍 API Local: http://localhost:${PORT}/api`);
      console.log(`🗄️ Base de datos: PostgreSQL`);
      console.log(`📊 Host DB: ${process.env.DB_HOST || 'localhost'}`);
      console.log(`🔐 Login: admin / admin123`);
      console.log('✨ Funcionalidades disponibles:');
      console.log('   • Gestión de productos normalizada');
      console.log('   • Control de inventario por sucursal');
      console.log('   • Sistema de pedidos completo');
      console.log('   • Reportes y estadísticas avanzadas');
      console.log('   • Base de datos PostgreSQL robusta');
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

console.log('🔄 Iniciando servidor con PostgreSQL...');
startServer();
