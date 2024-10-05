const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const app = Express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '200mb' })); // Setting limit to 200MB for JSON bodies
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true })); // Same limit for URL-encoded data
app.use(Express.json());


// Session Middleware
app.use(session({
    secret: 'your_secret_key', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if using HTTPS in production
}));

// MongoDB Connection
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
const upload = multer({
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

// Configure multer for file uploads (200MB limit for images)

// Error Handling Middleware for Payload Too Large
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(413).json({ message: "File is too large. Maximum allowed size is 200MB." });
    } else if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: "Request payload is too large." });
    }
    next(err);
});

// Signup Route (User Registration)
app.post('/api/social_media/signup', async (req, res) => {
    const { mobile, email, fullName, username, password, gender, dateOfBirth } = req.body;

    if (!mobile || !fullName || !username || !password || !email || !gender || !dateOfBirth) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const student = await database.collection("students").findOne({ mobile, email });
        if (!student) {
            return res.status(400).json({ message: "Student not recognized" });
        }

        const existingUser = await database.collection("user").findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await database.collection("user").insertOne({
            mobile,
            email,
            fullName,
            username,
            gender,
            dateOfBirth,
            profilePic: "",
            privacy: 0,
            password: hashedPassword
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
        const user = await database.collection("user").findOne({
            $or: [
                { username: mobileOrEmailOrUsername },
                { email: mobileOrEmailOrUsername },
                { mobile: mobileOrEmailOrUsername }
            ]
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid username, email, or mobile number" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            bio: user.bio,
            gender: user.gender,
            dateOfBirth: user.dateOfBirth,
            accountPrivacy: user.accountPrivacy,
            profile_pic: user.profile_pic,
            email: user.email,
            mobile: user.mobile
        };

        res.json({ message: "Login successful", user: req.session.user });
        console.log(user);
    } catch (error) {
        res.status(500).json({ message: "Error during login", error });
    }
});

// Endpoint for profile updates with file upload handling
app.post('/api/social_media/update_profile', async (req, res) => {
    const { email, bio, username, gender, dateOfBirth, accountPrivacy, profilePic } = req.body;
  
    try {
      // Find the user by email
      const user = await database.collection("user").findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Update the profile fields
      const updateFields = { bio, username, gender, date_of_birth: dateOfBirth, account_privacy: accountPrivacy };
  
      // Only update the profile picture if one is provided
      if (profilePic) {
        updateFields.profile_pic = profilePic; // Base64 string will be stored directly in the database
      }
  
      const result = await database.collection("user").updateOne({ email }, { $set: updateFields });
  
      if (result.modifiedCount > 0) {
        res.json({ message: 'Profile updated successfully!' });
      } else {
        res.status(400).json({ message: 'No changes were made' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
  });
  
// Route to Get User Info After Login
app.get('/api/social_media/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    res.json({ user: req.session.user });
});


// Search API (by username or full name)
app.get('/api/social_media/search', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ message: "Search query is required" });
    }

    try {
        // Search users by matching either the username or full name
        const users = await database.collection("user").find({
            $or: [
                { username: { $regex: query, $options: 'i' } }, // Case-insensitive regex for username
                { fullName: { $regex: query, $options: 'i' } }  // Case-insensitive regex for full name
            ]
        }).toArray();  // Convert the cursor to an array

        if (users.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        // Return the found users (excluding sensitive info like passwords)
        const result = users.map(user => ({
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            bio: user.bio,
            gender: user.gender,
            dateOfBirth: user.dateOfBirth,
            profile_pic: user.profile_pic,
            accountPrivacy: user.accountPrivacy
        }));
        console.log(result);

        res.json({ users: result });
    } catch (error) {
        res.status(500).json({ message: "Error searching for users", error });
    }
});

app.post('/api/social_media/follow', async (req, res) => {
    try {
        const { follower, user_id } = req.body;

        // Input validation
        if (!follower || !user_id) {
            return res.status(400).json({ message: "follower and user_id are required" });
        }

        // Check if the user is already following the other user
        const existingFollow = await database.collection("followers").findOne({
            user_id,
            follower
        });

        if (existingFollow) {
            return res.status(400).json({ message: "You are already following this user." });
        }

        // Insert the follow data into the database
        const result = await database.collection("followers").insertOne({
            user_id,
            follower
        });

        res.status(201).json({ message: "following", result });
    } catch (error) {
        if (error.code === 11000) {
            // Handle unique index violation
            return res.status(400).json({ message: "You are already following this user." });
        }

        console.error("Error following user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});




// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
