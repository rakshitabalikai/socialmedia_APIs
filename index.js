const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    const { mobile, email, fullName, username, password, gender, dateOfBirth } = req.body;

    if (!mobile || !fullName || !username || !password || !email || !gender || !dateOfBirth) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Check if the mobile and email exist in the student table
        const student = await database.collection("students").findOne({ mobile, email });
        if (!student) {
            return res.status(400).json({ message: "Student not recognized" });
        }

        // Check if the username already exists
        const existingUser = await database.collection("user").findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const result = await database.collection("user").insertOne({
            mobile,
            email,
            fullName,
            username,
            gender,
            dateOfBirth,
            profilePic: "",
            privacy: 0,
            password: hashedPassword // Store hashed password
        });

        res.json({ message: "User added successfully", userId: result.insertedId });
    } catch (error) {
        res.status(500).json({ message: "Error inserting document", error });
    }
});

// Login Route (Authentication)
app.post('/api/social_media/login', async (req, res) => {
    const { mobileOrEmailOrUsername, password } = req.body;

    if (!mobileOrEmailOrUsername || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Find user by username, email, or mobile
        const user = await database.collection("user").findOne({
            $or: [
                { username: mobileOrEmailOrUsername },
                { email: mobileOrEmailOrUsername },
                { mobile: mobileOrEmailOrUsername }
            ]
        });

        // If user doesn't exist
        if (!user) {
            return res.status(400).json({ message: "Invalid username, email, or mobile number" });
        }

        // Compare the password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        // Create a session for the user
        req.session.user = { id: user._id, username: user.username, fullName: user.fullName };
        
        res.json({ message: "Login successful", user: req.session.user });
    } catch (error) {
        res.status(500).json({ message: "Error during login", error });
    }
});

// API to Update User Profile
app.post('/api/social_media/update_profile', async (req, res) => {
    const { bio, username, gender, dateOfBirth, accountPrivacy, profilePic } = req.body;

    try {
        const userId = req.session?.user?.id;  // Ensure session and user are properly accessed
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Update user document with new fields
        const result = await database.collection('user').updateOne(
            { _id: ObjectId(userId) },  // Cast userId to ObjectId
            {
                $set: {
                    bio: bio,
                    username: username,
                    gender: gender,
                    date_of_birth: dateOfBirth,
                    account_privacy: accountPrivacy,
                    profile_pic: profilePic, // Store Base64 encoded image
                },
            }
        );

        if (result.modifiedCount > 0) {
            res.json({ message: 'Profile updated successfully!' });
        } else {
            res.status(400).json({ message: 'No changes were made' });
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Route to Get User Info After Login
app.get('/api/social_media/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    res.json({ user: req.session.user });
});

//search bar
// API to search for users
app.get('/api/social_media/search_users', async (req, res) => {
    const { searchTerm } = req.query;

    if (!searchTerm) {
        return res.status(400).json({ message: "Search term is required" });
    }

    try {
        // Perform a search based on username, email, or fullName
        const users = await database.collection("user").find({
            $or: [
                { username: { $regex: searchTerm, $options: 'i' } },  // Case-insensitive search
                { email: { $regex: searchTerm, $options: 'i' } },
                { fullName: { $regex: searchTerm, $options: 'i' } }
            ]
        }).toArray();  // Convert the cursor to an array of users

        // Return the search results
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
});



// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});

