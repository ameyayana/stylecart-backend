const fastify = require('fastify')({ logger: true });
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.json');

// Enable Cross-Origin Resource Sharing so your Vercel frontend can talk to your Render backend
fastify.register(require('@fastify/cors'), { 
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] 
});

fastify.register(require('@fastify/jwt'), { 
  secret: 'super-secret-stylish-key-change-this-in-production' 
});

/* --- DATABASE UTILITIES --- */
function readDatabase() {
  try {
    if (!fs.existsSync(dbPath)) return { users: [], products: [], orders: [] };
    const rawData = fs.readFileSync(dbPath, 'utf8');
    const data = JSON.parse(rawData);
    return { 
      users: data.users || [], 
      products: data.products || [], 
      orders: data.orders || [] 
    };
  } catch (err) {
    return { users: [], products: [], orders: [] };
  }
}

function saveDatabase(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

/* --- AUTHENTICATION & MIDDLEWARE --- */
fastify.decorate("authenticate", async function(request, reply) {
  try { 
    await request.jwtVerify(); 
  } catch (err) { 
    reply.status(401).send({ error: 'Authentication required.' }); 
  }
});

fastify.decorate("authorizeAdmin", async function(request, reply) {
  if (request.user.role !== 'admin') {
    reply.status(403).send({ error: 'Admin access required.' });
  }
});

/* --- ROUTES --- */

fastify.get('/', async () => ({ status: "online", message: "StyleCart Backend Engine active" }));

fastify.get('/api/products', async () => readDatabase().products);

fastify.post('/api/auth/register', async (request, reply) => {
  const { name, email, password, isAdmin } = request.body;
  const db = readDatabase();
  if (db.users.find(u => u.email === email)) return reply.status(400).send({ error: 'User exists.' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const role = isAdmin ? 'admin' : 'customer';
  
  const memberStatus = role === 'admin' ? 'Admin' : 'Regular Member';

  db.users.push({ 
    id: db.users.length + 1, 
    name, 
    email, 
    password: hashedPassword, 
    role, 
    memberStatus 
  });
  
  saveDatabase(db);
  return reply.status(201).send({ message: 'Success' });
});

fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  const db = readDatabase();
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return reply.status(401).send({ error: 'Invalid credentials.' });
  }
  
  const token = fastify.jwt.sign({ 
    id: user.id, 
    email: user.email, 
    role: user.role 
  });
  
  const verifiedStatus = user.role === 'admin' ? 'Admin' : (user.memberStatus || 'Regular Member');
  
  return { 
    token: token, 
    user: { 
      name: user.name, 
      email: user.email, 
      role: user.role, 
      memberStatus: verifiedStatus
    } 
  };
});

// --- ORDER ROUTES ---
fastify.post('/api/checkout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { cartItems, shipping } = request.body;
  const db = readDatabase();
  
  for (const item of cartItems) {
    const product = db.products.find(p => String(p.id) === String(item.id));
    if (!product) {
      return reply.status(404).send({ error: `Product not found in system storage.` });
    }
    if (product.stock < item.quantity) {
      return reply.status(400).send({ error: `Insufficient stock for ${product.name || 'item'}` });
    }
    product.stock -= item.quantity;
  }
  
  const newOrder = {
    orderId: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
    userEmail: request.user.email.toLowerCase().trim(),
    items: cartItems,
    shipping,
    status: 'Waiting for shipping',
    timestamp: new Date().toISOString()
  };
  
  db.orders.push(newOrder);
  saveDatabase(db);
  return { message: 'Purchase success', orderId: newOrder.orderId };
});

fastify.get('/api/orders', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const db = readDatabase();
  const currentUserEmail = request.user.email.toLowerCase().trim();
  return db.orders.filter(o => o.userEmail && o.userEmail.toLowerCase().trim() === currentUserEmail);
});

// --- ADMIN CRUD ROUTES ---
fastify.post('/api/admin/products', { onRequest: [fastify.authenticate, fastify.authorizeAdmin] }, async (req) => {
  const db = readDatabase();
  const newProduct = { id: Date.now(), image: 'new.jpg', ...req.body };
  db.products.push(newProduct);
  saveDatabase(db);
  return newProduct;
});

fastify.delete('/api/admin/products/:id', { onRequest: [fastify.authenticate, fastify.authorizeAdmin] }, async (req) => {
  let db = readDatabase();
  db.products = db.products.filter(p => String(p.id) !== String(req.params.id));
  saveDatabase(db);
  return { message: 'Deleted' };
});

fastify.put('/api/admin/products/:id', { onRequest: [fastify.authenticate, fastify.authorizeAdmin] }, async (req) => {
  let db = readDatabase();
  const index = db.products.findIndex(p => String(p.id) === String(req.params.id));
  if (index === -1) return { error: 'Not found' };
  db.products[index] = { ...db.products[index], ...req.body };
  saveDatabase(db);
  return db.products[index];
});

/* --- FIXED SERVER LIFECYCLE INITIALIZATION BLOCK --- */
const startServer = async () => {
  try {
    // 1. Accept Render's dynamic port assignment or fall back to 5000 locally
    const port = process.env.PORT || 5000;

    // 2. Bind host to 0.0.0.0 so Render's internal proxy routers can direct traffic to it
    await fastify.listen({ port: Number(port), host: '0.0.0.0' });
    console.log(`🚀 StyleCart Fastify Engine successfully live on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
startServer();