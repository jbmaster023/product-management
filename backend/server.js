// server.js - Backend Mínimo para Testing
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3053;

// Middleware básico
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Datos temporales en memoria (para testing)
let products = [
  {
    id: 1,
    name: 'Laptop Dell XPS 13',
    description: 'Laptop ultrabook con procesador Intel Core i7',
    price: 1299.99,
    stock: 15,
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
    branch: 'Sur',
    images: '[]',
    created_at: new Date().toISOString()
  }
];

let orders = [
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

// Usuario hardcodeado para testing
const adminUser = {
  id: 1,
  username: 'admin',
  password: 'admin123', // En producción usar hash
  role: 'admin'
};

// Rutas de salud
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'In-Memory (Testing)',
    message: 'Backend funcionando correctamente'
  });
});

// Login simplificado
app.post('/api/auth/login', (req, res) => {
  console.log('Login attempt:', req.body);
  
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('Missing credentials');
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    // Verificación simple (sin bcrypt para testing)
    if (username === adminUser.username && password === adminUser.password) {
      console.log('✅ LOGIN SUCCESSFUL');
      res.json({
        success: true,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          role: adminUser.role
        }
      });
    } else {
      console.log('❌ Invalid credentials');
      res.status(401).json({ error: 'Credenciales incorrectas' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Productos
app.get('/api/products', (req, res) => {
  console.log('Products requested');
  res.json(products);
});

app.post('/api/products', (req, res) => {
  console.log('Creating product:', req.body);
  
  const { name, description, price, stock, branch, images = [] } = req.body;
  
  if (!name || !price || !stock || !branch) {
    return res.status(400).json({ error: 'Campos requeridos: name, price, stock, branch' });
  }

  const newProduct = {
    id: Date.now(),
    name,
    description,
    price: parseFloat(price),
    stock: parseInt(stock),
    branch,
    images: JSON.stringify(images),
    created_at: new Date().toISOString()
  };
  
  products.push(newProduct);
  res.json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock, branch, images = [] } = req.body;
  
  const productIndex = products.findIndex(p => p.id == id);
  
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  products[productIndex] = {
    ...products[productIndex],
    name,
    description,
    price: parseFloat(price),
    stock: parseInt(stock),
    branch,
    images: JSON.stringify(images)
  };
  
  res.json(products[productIndex]);
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  
  const productIndex = products.findIndex(p => p.id == id);
  
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  
  products.splice(productIndex, 1);
  res.json({ success: true, message: 'Producto eliminado correctamente' });
});

// Pedidos
app.get('/api/orders', (req, res) => {
  console.log('Orders requested');
  res.json(orders);
});

// Estadísticas
app.get('/api/stats', (req, res) => {
  console.log('Stats requested');
  
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, product) => sum + (product.price * product.stock), 0);
  const totalOrders = orders.length;
  const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
  
  res.json({
    totalProducts,
    totalValue,
    totalOrders,
    totalSales
  });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Sistema de Gestión de Productos - Versión de Testing',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/products',
      'GET /api/orders',
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
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 BACKEND MÍNIMO INICIADO');
  console.log(`🌐 Puerto: ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log(`🔐 Login: admin / admin123`);
  console.log(`💾 Datos: En memoria (testing)`);
  console.log('=================================');
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('🛑 Cerrando servidor...');
  process.exit(0);
});