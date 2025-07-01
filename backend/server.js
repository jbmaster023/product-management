// server-simple.js - Backend simplificado para resolver errores
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3053;

// Datos en memoria
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
    productsCount: products.length
  });
});

// Login
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

// Productos
app.get('/api/products', (req, res) => {
  console.log('📦 Getting products...');
  const search = req.query.search || '';
  
  let filteredProducts = [...products];
  
  if (search) {
    filteredProducts = products.filter(product => 
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(search.toLowerCase()))
    );
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
    images
  };
  
  console.log('✅ Product updated');
  res.json(products[index]);
});

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

// Pedidos
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

// Estadísticas
app.get('/api/stats', (req, res) => {
  console.log('📊 Getting stats...');
  
  const stats = {
    totalProducts: products.length,
    totalValue: products.reduce((sum, p) => sum + (p.price * p.stock), 0),
    totalOrders: orders.length,
    totalSales: orders.reduce((sum, o) => sum + o.total, 0)
  };
  
  console.log('✅ Stats calculated:', stats);
  res.json(stats);
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Gestión funcionando',
    status: 'OK',
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
app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 BACKEND SIMPLIFICADO INICIADO');
  console.log(`🌐 Puerto: ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log('🔐 Login: admin / admin123');
  console.log(`📦 Productos: ${products.length}`);
  console.log('=================================');
});

console.log('🔄 Iniciando servidor...');
