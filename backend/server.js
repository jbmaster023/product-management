// Extensiones del backend para soportar paginación
// Agregar estas funciones al server.js existente

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
    const validSortFields = ['nombre', 'precio', 'categoria', 'created_at', 'stock_total'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'nombre';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    let products = [];
    let totalCount = 0;
    
    // Intentar usar función personalizada o fallback
    if (functionsAvailable.buscar_productos) {
      try {
        // Para la función personalizada, necesitamos modificarla para soportar paginación
        const result = await executeQuery(
          'SELECT * FROM buscar_productos($1, $2, $3)',
          [search, category, status]
        );
        
        // Aplicar paginación manualmente ya que la función no la soporta
        const allProducts = result.rows;
        totalCount = allProducts.length;
        
        // Ordenar
        allProducts.sort((a, b) => {
          let aVal = a[sortField] || '';
          let bVal = b[sortField] || '';
          
          if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }
          
          if (sortDirection === 'DESC') {
            return aVal < bVal ? 1 : -1;
          }
          return aVal > bVal ? 1 : -1;
        });
        
        products = allProducts.slice(offset, offset + limitNum);
        
      } catch (error) {
        console.log('⚠️ Función buscar_productos falló, usando fallback');
        functionsAvailable.buscar_productos = false;
        const result = await getProductsWithPagination(search, status, category, pageNum, limitNum, sortField, sortDirection);
        products = result.products;
        totalCount = result.totalCount;
      }
    } else {
      const result = await getProductsWithPagination(search, status, category, pageNum, limitNum, sortField, sortDirection);
      products = result.products;
      totalCount = result.totalCount;
    }
    
    // Formatear datos para el frontend
    const formattedProducts = products.map(row => ({
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
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;
    
    console.log(`✅ Returning ${formattedProducts.length} of ${totalCount} products (page ${pageNum}/${totalPages})`);
    
    res.json({
      products: formattedProducts,
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
    dataQuery += `
      GROUP BY p.id_articulo, p.numero_articulo, p.nombre, p.categoria, 
               p.precio, p.descripcion, p.activo, p.created_at, p.updated_at
      ORDER BY ${sortField === 'stock_total' ? 'COALESCE(SUM(i.cantidad), 0)' : 'p.' + sortField} ${sortDirection}
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
    const validSortFields = ['created_at', 'total', 'cliente_nombre', 'estado'];
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
    
    const dataQuery = `${baseQuery} ORDER BY ${sortField} ${sortDirection} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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

app.get('/api/reports/inventory-value', async (req, res) => {
  console.log('💰 Getting inventory value report with pagination...');
  
  try {
    const { 
      page = 1,
      limit = 20,
      category = '',
      sort_by = 'valor_total',
      sort_order = 'DESC'
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    let baseQuery = `
      SELECT 
        p.id_articulo,
        p.nombre,
        p.categoria,
        p.precio,
        COALESCE(SUM(i.cantidad), 0) as stock_total,
        (p.precio * COALESCE(SUM(i.cantidad), 0)) as valor_total
      FROM productos p
      LEFT JOIN inventarios i ON p.id_articulo = i.id_articulo
      WHERE p.activo = true
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Filtro por categoría
    if (category) {
      baseQuery += ` AND p.categoria = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    baseQuery += ` GROUP BY p.id_articulo, p.nombre, p.categoria, p.precio`;
    
    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as counted`;
    const countResult = await executeQuery(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Data query con ordenamiento y paginación
    const validSortFields = ['valor_total', 'nombre', 'categoria', 'precio', 'stock_total'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'valor_total';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    const dataQuery = `${baseQuery} ORDER BY ${sortField} ${sortDirection} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);
    
    const dataResult = await executeQuery(dataQuery, params);
    
    const inventoryValue = dataResult.rows.map(row => ({
      product_id: row.id_articulo,
      product_name: row.nombre,
      category: row.categoria,
      unit_price: parseFloat(row.precio),
      total_stock: parseInt(row.stock_total) || 0,
      total_value: parseFloat(row.valor_total) || 0
    }));
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      inventory_value: inventoryValue,
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
    console.error('❌ Error getting inventory value report:', error);
    res.status(500).json({ error: 'Error obteniendo reporte de valor de inventario' });
  }
});
