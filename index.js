const { MongoClient, ServerApiVersion } = require('mongodb');
const Express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = Express();
app.use(cors());

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

// Get user info route
app.get('/api/social_media/getinfo', async (req, res) => {
    if (!database) {
        return res.status(500).send("Database not connected");
    }
    try {
        const result = await database.collection("user").find({}).toArray();
        console.log(result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching data", error });
    }
});

// Add user info route
app.use(Express.json()); // Middleware to parse JSON bodies

// Add user info route
app.post('/api/social_media/addinfo', async (req, res) => {
    if (!database) {
        return res.status(500).send("Database not connected");
    }

    const { mobileOrEmail, fullName, username, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await database.collection("user").findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // Count documents to generate user ID
        const numofDocs = await database.collection("user").countDocuments();

        // Insert new user
        const result = await database.collection("user").insertOne({
            _id:mobileOrEmail,
            fullName,
            username,
            password
        });

        res.json({ message: "User added successfully", userId: result.insertedId });
    } catch (error) {
        res.status(500).json({ message: "Error inserting document", error });
    }
});

// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
