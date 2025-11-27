const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  dotenv.config({ path: '.env.local' });
}

const app = express();
const port = process.env.PORT || 5000;

// Validate required environment variables
if (!process.env.DB_USER || !process.env.DB_PASS) {
  console.error('❌ Missing DB_USER or DB_PASS in environment variables.');
  process.exit(1);
}

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tlyifmj.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// Middleware

app.use(cors({
  origin: ["http://localhost:3000", "https://ridezone-ui.vercel.app"],
  credentials: true,
}));
app.use(express.json());

// Global collections
let userCollection;
let productCollection;

// -------------------------
// Routes
// -------------------------
app.get('/', (req, res) => res.send('RideZone API is running 🚴‍♂️'));

// -------------------------
// User Routes
// -------------------------
app.post('/register', async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "Database not connected yet" });

    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields are required" });

    const existing = await userCollection.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await userCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      provider: "credentials",
      createdAt: new Date(),
    });

    res.status(201).json({ message: "User registered successfully", userId: result.insertedId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post('/auth/google-signin', async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "Database not connected yet" });

    const { name, email, image, googleId } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    let user = await userCollection.findOne({ email });

    if (!user) {
      const result = await userCollection.insertOne({
        name,
        email,
        image,
        googleId,
        provider: "google",
        createdAt: new Date(),
      });

      return res.status(201).json({
        message: "User created successfully",
        user: { _id: result.insertedId, name, email, image },
      });
    }

    if (!user.googleId) {
      await userCollection.updateOne(
        { email },
        { $set: { googleId, image: image || user.image, provider: "google", updatedAt: new Date() } }
      );
    }

    res.status(200).json({
      message: "User already exists",
      user: { _id: user._id, name: user.name, email: user.email, image: user.image },
    });

  } catch (err) {
    console.error("Error in /auth/google-signin:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------------
// Product Routes
// -------------------------
app.get('/products', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });
    const products = await productCollection.find().toArray();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected yet" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product ID" });

    const product = await productCollection.findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post('/products', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });

    const { title, brand, model, price, image,  shortDescription, userId } = req.body;
    if (!title || !brand || !price) return res.status(400).json({ message: "Please fill all required fields" });

    const safeImage = image && image.startsWith("http") ? image : null;

    const result = await productCollection.insertOne({
      title,
      brand,
      model,
      price,
      image: safeImage,
      shortDescription,
      userId,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Product added successfully", productId: result.insertedId });

  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put('/products/:id', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product ID" });

    const updateData = { ...req.body };
    if (updateData.image && !updateData.image.startsWith("http")) {
      updateData.image = null;
    }

    const result = await productCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product updated successfully" });

  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid product ID" });

    const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product deleted successfully" });

  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------------
// MongoDB Connection
// -------------------------
async function run() {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await client.connect();

    const db = client.db('ridezone');
    userCollection = db.collection('users');
    productCollection = db.collection('products');

    // Fix invalid product images
    await productCollection.updateMany(
      { $or: [{ image: { $regex: "i.ibb.co.com" } }, { image: "https://via.placeholder.com/150" }] },
      [
        {
          $set: {
            image: {
              $cond: [
                { $eq: ["$image", "https://via.placeholder.com/150"] },
                null,
                { $replaceOne: { input: "$image", find: "i.ibb.co.com", replacement: "i.ibb.co" } }
              ]
            }
          }
        }
      ]
    );

    console.log("✅ MongoDB Connected Successfully!");
// -----------------------------
    // CATEGORY AUTO UPDATE SECTION
    // -----------------------------

    // First 10 → Bike
    const first10 = await productCollection.find().limit(10).toArray();
    if (first10.length > 0) {
      await productCollection.updateMany(
        { _id: { $in: first10.map(item => item._id) } },
        { $set: { category: "Bike" } }
      );
      console.log("🚴 First 10 products updated → Bike");
    }

    // Next 10 → Car
    const next10 = await productCollection.find().skip(10).limit(10).toArray();
    if (next10.length > 0) {
      await productCollection.updateMany(
        { _id: { $in: next10.map(item => item._id) } },
        { $set: { category: "Car" } }
      );
      console.log("🚗 Next 10 products updated → Car");
    }

    // Next 10 → Bicycle
    const next10After20 = await productCollection.find().skip(20).limit(10).toArray();
    if (next10After20.length > 0) {
      await productCollection.updateMany(
        { _id: { $in: next10After20.map(item => item._id) } },
        { $set: { category: "Bicycle" } }
      );
      console.log("🚲 Next 10 products updated → Bicycle");
    }

    console.log("🏁 Category update completed!");

  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

run().catch(console.dir);

// -------------------------
// Start Server
// -------------------------
app.listen(port, () => {
  console.log(`🚀 RideZone API running at http://localhost:${port}`);
});
