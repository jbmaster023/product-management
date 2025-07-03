// server.js - Actualización mínima del servidor existente
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3053;

// Datos en memoria ACTUALIZADOS con campo 'active'
let products = [
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
    active: true, // NUEVO CAMPO
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
    active: true, // NUEVO CAMPO
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
    active: false, // NUEVO CAMPO - Este producto está desactivado
    created_at: new Date().toISOString()
  }
];

let orders = [
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

// Middleware
app.use(cors());
app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas básicas
app.get('/api/health', (req, res) => {
  console.log('✅ Health check requested');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Backend funcionando correctamente',
    productsCount: products.length,
    activeProducts: products.filter(p => p.active).length // NUEVO
  });
});

// Login (SIN CAMBIOS)
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Login attempt:', req.body);
  
  const { username, password } = req.body;
  
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
});

// Productos ACTUALIZADOS
app.get('/api/products', (req, res) => {
  console.log('📦 Getting products...');
  const search = req.query.search || '';
  const status = req.query.status; // NUEVO: filtro por estado
  
  let filteredProducts = [...products];
  
  // Filtro de búsqueda (existente)
  if (search) {
    filteredProducts = filteredProducts.filter(product => 
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(search.toLowerCase()))
    );
  }
  
  // NUEVO: Filtro de estado
  if (status === 'active') {
    filteredProducts = filteredProducts.filter(product => product.active === true);
  } else if (status === 'inactive') {
    filteredProducts = filteredProducts.filter(product => product.active === false);
  }
  
  console.log(`✅ Returning ${filteredProducts.length} products`);
  res.json(filteredProducts);
});

app.post('/api/products', (req, res) => {
  console.log('📝 Creating product:', req.body);
  const { name, description, price, stock, branch, category = '', images = [] } = req.body;
  
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
    active: true, // NUEVO: productos nuevos activos por defecto
    created_at: new Date().toISOString()
  };
  
  products.push(newProduct);
  console.log('✅ Product created');
  res.json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock, branch, category = '', images = [] } = req.body;
  
  console.log(`📝 Updating product ${id}`);
  
  const index = products.findIndex(p => p.id == id);
  if (index === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  products[index] = {
    ...products[index],
    name,
    description,
    price: parseFloat(price),
    stock: parseInt(stock),
    branch,
    category,
    images,
    // NUEVO: mantener el estado activo actual
    active: products[index].active,
    updated_at: new Date().toISOString()
  };
  
  console.log('✅ Product updated');
  res.json(products[index]);
});

// NUEVA RUTA: Cambiar estado del producto
app.patch('/api/products/:id/status', (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  
  console.log(`🔄 Updating product ${id} status to: ${active}`);
  
  const index = products.findIndex(p => p.id == id);
  if (index === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  products[index].active = Boolean(active);
  products[index].updated_at = new Date().toISOString();
  
  console.log(`✅ Product ${id} status updated to: ${products[index].active}`);
  res.json({ 
    success: true, 
    message: `Producto ${active ? 'activado' : 'desactivado'} correctamente`,
    product: products[index]
  });
});

// Resto de rutas SIN CAMBIOS
app.put('/api/products/:id/stock', (req, res) => {
  const { id } = req.params;
  const { stock_principal, stock_higuey } = req.body;
  
  console.log(`📦 Updating stock for product ${id}`);
  
  const productIndex = products.findIndex(p => p.id == id);
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  const totalStock = (parseInt(stock_principal) || 0) + (parseInt(stock_higuey) || 0);
  
  products[productIndex].stock = totalStock;
  products[productIndex].stock_detail = `Principal: ${stock_principal || 0}, Higüey: ${stock_higuey || 0}`;
  products[productIndex].stock_by_branch = {
    'Principal': parseInt(stock_principal) || 0,
    'Higüey': parseInt(stock_higuey) || 0
  };
  
  console.log('✅ Stock updated');
  res.json(products[productIndex]);
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Deleting product ${id}`);
  
  const index = products.findIndex(p => p.id == id);
  if (index === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  products.splice(index, 1);
  console.log('✅ Product deleted');
  res.json({ success: true, message: 'Producto eliminado correctamente' });
});

// Pedidos (SIN CAMBIOS)
app.get('/api/orders', (req, res) => {
  console.log('🛒 Getting orders...');
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  console.log('📝 Creating order:', req.body);
  const { customer_name, products: orderProducts, address, total, status = 'pending' } = req.body;
  
  const newOrder = {
    id: Date.now(),
    customer_name,
    products: orderProducts,
    address,
    total: parseFloat(total),
    status,
    created_at: new Date().toISOString()
  };
  
  orders.push(newOrder);
  console.log('✅ Order created');
  res.json(newOrder);
});

// Estadísticas ACTUALIZADAS
app.get('/api/stats', (req, res) => {
  console.log('📊 Getting stats...');
  
  const activeProducts = products.filter(p => p.active); // NUEVO
  
  const stats = {
    totalProducts: products.length,
    activeProducts: activeProducts.length, // NUEVO
    inactiveProducts: products.filter(p => !p.active).length, // NUEVO
    totalValue: products.reduce((sum, p) => sum + (p.price * p.stock), 0),
    activeValue: activeProducts.reduce((sum, p) => sum + (p.price * p.stock), 0), // NUEVO
    totalOrders: orders.length,
    totalSales: orders.reduce((sum, o) => sum + o.total, 0)
  };
  
  console.log('✅ Stats calculated:', stats);
  res.json(stats);
});

// Resto de rutas (SIN CAMBIOS)
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión funcionando',
    status: 'OK',
    version: '2.1.0', // Actualizada
    features: [
      'Gestión de productos con estado activo/inactivo', // NUEVO
      'Filtros por estado y búsqueda',
      'Estadísticas detalladas',
      'Control de stock por sucursal'
    ],
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/products',
      'POST /api/products',
      'PUT /api/products/:id',
      'PATCH /api/products/:id/status - NUEVO: Cambiar estado activo/inactivo',
      'DELETE /api/products/:id',
      'GET /api/orders',
      'POST /api/orders',
      'GET /api/stats'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404
app.use('*', (req, res) => {
  console.log('❌ 404 Not Found:', req.path);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 BACKEND ACTUALIZADO INICIADO');
  console.log(`🌐 Puerto: ${PORT}`);
  console.log(`📍 API Local: http://localhost:${PORT}/api`);
  console.log('🔐 Login: admin / admin123');
  console.log(`📦 Total productos: ${products.length}`);
  console.log(`✅ Productos activos: ${products.filter(p => p.active).length}`);
  console.log(`❌ Productos inactivos: ${products.filter(p => !p.active).length}`);
  console.log('🆕 Nueva funcionalidad: Control de estado de productos');
  console.log('=================================');
});

console.log('🔄 Iniciando servidor...');
