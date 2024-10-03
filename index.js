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
    } catch (error) {
        res.status(500).json({ message: "Error during login", error });
    }
});

// Endpoint for profile updates with file upload handling
app.post('/api/social_media/update_profile', upload.single('profilePic'), async (req, res) => {
    const { email, bio, username, gender, dateOfBirth, accountPrivacy } = req.body;
    let profilePic = req.file ? req.file.buffer.toString('base64') : null;

    try {
        const user = await database.collection("user").findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateFields = { bio, username, gender, date_of_birth: dateOfBirth, account_privacy: accountPrivacy };

        if (profilePic) {
            updateFields.profile_pic = profilePic;
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

// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
