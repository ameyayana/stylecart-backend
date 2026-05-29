// FORCE DEPLOYMENT PATCH VALUE 1.0.1
const fastify = require('fastify')({ logger: true });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Enable Cross-Origin Resource Sharing so Vercel can communicate with Render
fastify.register(require('@fastify/cors'), { 
  origin: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

fastify.register(require('@fastify/jwt'), { 
  secret: 'super-secret-stylish-key-change-this-in-production' 
});

/* --- STEP 2A: MONGODB MONGOOSE SCHEMAS --- */
const UserSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' },
  memberStatus: { type: String, default: 'Regular Member' }
});

const ProductSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  imageName: { type: String, required: true },
  stock: { type: Number, required: true },
  description: { type: String, required: true }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  userEmail: { type: String, required: true },
  items: Array,
  shipping: Object,
  status: { type: String, default: 'Waiting for shipping' },
  timestamp: { type: String, default: () => new Date().toISOString() }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);

/* --- STEP 2B: AUTHENTICATION & MIDDLEWARE --- */
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

/* --- STEP 2C: DATABASE UTILITIES FOR INITIAL SEEDING --- */
async function seedDatabaseIfEmpty() {
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    console.log("🌱 Database empty. Seeding initial products directly from your collection...");
    const initialProducts = [
      { id: 1, name: "Piano Skirt", price: 79.9, category: "Apparel", imageName: "skirt.jpg", stock: 8, description: "A striking monochrome piece featuring a vintage pleated piano-key design." },
      { id: 2, name: "Forest Skirt", price: 69.9, category: "Apparel", imageName: "skirt2.jpg", stock: 4, description: "Rich emerald green wool-blend textured skirt featuring unique architectural slit cuts." },
      { id: 12, name: "Polka Skirt", price: 59.9, category: "Apparel", imageName: "skirt3.jpg", stock: 11, description: "A classic retro style updated for modern street style curation." },
      { id: 3, name: "Brown Leather Jacket", price: 59.9, category: "Apparel", imageName: "jacket.jpg", stock: 2, description: "Authentic oversized heavy-drop vintage leather jacket." },
      { id: 4, name: "Red Leather Jacket", price: 69.9, category: "Apparel", imageName: "jacket3.jpg", stock: 5, description: "Bold cherry-red statement leather jacket with a clean minimalist silhouette." },
      { id: 5, name: "Reversible Jacket", price: 129.9, category: "Apparel", imageName: "jacket2.jpg", stock: 2, description: "Premium multi-functional heavy utility jacket featuring a fully reversible interior design phase." },
      { id: 6, name: "Shorts", price: 49.9, category: "Apparel", imageName: "pants.jpg", stock: 20, description: "Comfortable streetwear-ready tailored lounge shorts." },
      { id: 7, name: "Jean Shorts", price: 59.9, category: "Apparel", imageName: "pants2.jpg", stock: 12, description: "Relaxed-fit raw denim shorts featuring custom edge profiling." },
      { id: 8, name: "Brown Pants", price: 49.9, category: "Apparel", imageName: "pants3.jpg", stock: 10, description: "Classic earthy tone relaxed utility trousers." },
      { id: 9, name: "Star Sweater", price: 69.9, category: "Apparel", imageName: "sweater.jpg", stock: 7, description: "Cozy knit winter pullover detailed with signature woven star silhouettes." },
      { id: 10, name: "Cat Sweater", price: 69.9, category: "Apparel", imageName: "sweater2.jpg", stock: 5, description: "Whimsical contemporary knit style celebrating street-level graphic design elements." }
    ];
    await Product.insertMany(initialProducts);
    
    const adminExists = await User.findOne({ email: 'aaa@gmail.com' });
    if (!adminExists) {
      const hashedAdminPassword = await bcrypt.hash('aaa123', 10);
      await User.create({
        id: 1,
        name: "Amelia Farhana Binti Azizan",
        email: "aaa@gmail.com",
        password: hashedAdminPassword,
        role: "admin",
        memberStatus: "Admin"
      });
    }
    console.log("✅ Seed complete.");
  }
}

/* --- STEP 2D: API ROUTES --- */

// Root URL Health Check Route
fastify.get('/', async () => {
  return { status: "online", message: "StyleCart MongoDB Engine active" };
});

// Fetch All Products Route
fastify.get('/api/products', async () => {
  return await Product.find({}).sort({ id: 1 });
});

// Fetch Single Product Route
fastify.get('/api/products/:id', async (request, reply) => {
  const targetId = Number(request.params.id);
  const product = await Product.findOne({ id: targetId });
  if (!product) {
    return reply.status(404).send({ error: "Product profile could not be located." });
  }
  return product;
});

// 🔄 NEW ENDPOINT: Updates specific product parameters from administrative forms
fastify.put('/api/products/:id', async (request, reply) => {
  try {
    const targetId = Number(request.params.id);
    const { name, price, stock } = request.body;

    const updatedProduct = await Product.findOneAndUpdate(
      { id: targetId },
      { name, price: Number(price), stock: Number(stock) },
      { new: true }
    );

    if (!updatedProduct) {
      return reply.status(404).send({ error: "Product profile could not be found to modify." });
    }

    return { message: "Product updated successfully!", product: updatedProduct };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Internal processing failure during profile rewrite." });
  }
});

// User Registration Route
fastify.post('/api/auth/register', async (request, reply) => {
  const { name, email, password, isAdmin } = request.body;
  const userExists = await User.findOne({ email });
  if (userExists) return reply.status(400).send({ error: 'User exists.' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const role = isAdmin ? 'admin' : 'customer';
  const memberStatus = role === 'admin' ? 'Admin' : 'Regular Member';
  const internalId = Date.now();

  await User.create({ id: internalId, name, email, password: hashedPassword, role, memberStatus });
  return reply.status(201).send({ message: 'Success' });
});

// User Login Route
fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return reply.status(401).send({ error: 'Invalid credentials.' });
  }
  const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });
  return { 
    token: token, 
    user: { name: user.name, email: user.email, role: user.role, memberStatus: user.memberStatus || 'Regular Member' } 
  };
});

// Checkout Route
fastify.post('/api/checkout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { cartItems, shipping } = request.body;
  for (const item of cartItems) {
    const product = await Product.findOne({ id: Number(item.id) });
    if (!product || product.stock < item.quantity) return reply.status(400).send({ error: `Stock error.` });
    product.stock -= item.quantity;
    await product.save();
  }
  const newOrder = new Order({
    orderId: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
    userEmail: request.user.email.toLowerCase().trim(),
    items: cartItems,
    shipping
  });
  await newOrder.save();
  return { message: 'Purchase success', orderId: newOrder.orderId };
});

// Order History Lookup Route
fastify.get('/api/orders', { onRequest: [fastify.authenticate] }, async (request) => {
  return await Order.find({ userEmail: request.user.email.toLowerCase().trim() });
});

/* --- STEP 2E: SERVER INITIALIZATION BLOCK --- */
const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;
    const mongoURI = process.env.MONGODB_URI;
    
    await mongoose.connect(mongoURI);
    console.log("🔌 Connected safely to MongoDB Atlas Cloud");

    await seedDatabaseIfEmpty();

    await fastify.listen({ port: Number(port), host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
startServer();