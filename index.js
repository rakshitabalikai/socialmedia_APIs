const { MongoClient, ServerApiVersion } = require('mongodb');
const Express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session'); // for session-based auth

const app = Express();
app.use(cors());
app.use(Express.json()); // Middleware to parse JSON bodies

// Session Middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // In production, set this to true with HTTPS
}));

const dburl = "mongodb+srv://punithshanakanahalli:RaPufoHFjZl6eFtd@cluster0.ziyvd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const databasename = "social_media";
let database;

async function connecttomongodb() {
    try {
        const client = new MongoClient(dburl, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });
        await client.connect();
        database = client.db(databasename);
        console.log("MongoDB connection successful");
    } catch (error) {
        console.error("MongoDB connection failed:", error);
    }
}

// Signup Route (User Registration)
app.post('/api/social_media/signup', async (req, res) => {
    const { mobileOrEmail, fullName, username, password } = req.body;

    if (!mobileOrEmail || !fullName || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Check if user already exists
        const existingUser = await database.collection("user").findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const result = await database.collection("user").insertOne({
            _id: mobileOrEmail,
            fullName,
            username,
            password: hashedPassword // Store hashed password
        });

        res.json({ message: "User added successfully", userId: result.insertedId });
    } catch (error) {
        res.status(500).json({ message: "Error inserting document", error });
    }
});

// Login Route (Authentication)
app.post('/api/social_media/login', async (req, res) => {
    const { mobileOrEmail, password } = req.body;

    if (!mobileOrEmail || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Find user by mobileOrEmail
        const user = await database.collection("user").findOne({ _id: mobileOrEmail });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Create a session for the user
        req.session.user = { id: user._id, username: user.username, fullName: user.fullName };
        
        // Optionally, create a JWT token instead of session
        // const token = jwt.sign({ id: user._id, username: user.username }, 'your_jwt_secret_key', { expiresIn: '1h' });
        // res.json({ message: "Login successful", token });

        res.json({ message: "Login successful", user: req.session.user });
    } catch (error) {
        res.status(500).json({ message: "Error during login", error });
    }
});

// Route to Get User Info After Login
app.get('/api/social_media/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    res.json({ user: req.session.user });
});

// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
