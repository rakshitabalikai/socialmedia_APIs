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

app.get('/api/social_media/user/:userId', async (req, res) => {
    const { userId } = req.params;  // Get userId from the request parameters

    // Check if the userId is a valid MongoDB ObjectId
    if (!ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
        // Fetch the user from the database based on userId
        const user = await database.collection("user").findOne({ _id: new ObjectId(userId) });

        // If user not found, return error
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // If user found, construct the user object to return
        const userData = {
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            profile_pic: user.profile_pic,
            bio: user.bio,
            gender: user.gender,
            dateOfBirth: user.dateOfBirth,
        };

        // Send the user data as JSON response
        res.json({ user: userData });
        console.log(userData);
    } catch (error) {
        // Handle server errors
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
});

 // Admin Login Route
app.post('/api/social_media/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    try {
        // Check if the admin exists
        const admin = await database.collection("admin").findOne({ username });
        if (!admin) {
            return res.status(400).json({ message: "Invalid admin credentials" });
        }

        // Verify the password
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        // Set admin session
        req.session.admin = {
            id: admin._id,
            username: admin.username,
        };

        res.json({ message: "Admin login successful", admin: req.session.admin });
    } catch (error) {
        res.status(500).json({ message: "Error during admin login", error });
    }
});

// Fetch all students
app.get('/api/social_media/admin/students', async (req, res) => {
    try {
        const students = await database.collection("students").find().toArray();
        res.json({ students });
    } catch (error) {
        res.status(500).json({ message: "Error fetching students data", error });
    }
});

// Fetch all users
app.get('/api/social_media/admin/users', async (req, res) => {
    try {
        const users = await database.collection("user").find().toArray();
        res.json({ users });
    } catch (error) {
        res.status(500).json({ message: "Error fetching users data", error });
    }
});

 // Update user data (only passed fields)
app.put('/api/social_media/admin/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const updateData = req.body;

    // Remove any empty or undefined fields from the updateData
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' || updateData[key] === undefined) {
            delete updateData[key];
        }
    });

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
    }

    try {
        // Update user data
        const result = await database.collection("user").updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateData }
        );

        if (result.modifiedCount > 0) {
            res.json({ message: "User updated successfully" });
        } else {
            res.status(400).json({ message: "No changes made to user" });
        }
    } catch (error) {
        res.status(500).json({ message: "Error updating user", error });
    }
});

// Update student data (only passed fields)
app.put('/api/social_media/admin/student/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const updateData = req.body;

    // Remove any empty or undefined fields from the updateData
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' || updateData[key] === undefined) {
            delete updateData[key];
        }
    });

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
    }

    try {
        // Update student data
        const result = await database.collection("students").updateOne(
            { _id: new ObjectId(studentId) },
            { $set: updateData }
        );

        if (result.modifiedCount > 0) {
            res.json({ message: "Student updated successfully" });
        } else {
            res.status(400).json({ message: "No changes made to student" });
        }
    } catch (error) {
        res.status(500).json({ message: "Error updating student", error });
    }
});

// Delete a user
app.delete('/api/social_media/admin/deleteuser/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await database.collection("user").deleteOne({ _id: new ObjectId(userId) });

        if (result.deletedCount > 0) {
            res.json({ message: "User deleted successfully" });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ message: "Error deleting user", error });
    }
});

// Delete a student
app.delete('/api/social_media/admin/deletestudent/:studentId', async (req, res) => {
    const { studentId } = req.params;

    try {
        const result = await database.collection("students").deleteOne({ _id: new ObjectId(studentId) });

        if (result.deletedCount > 0) {
            res.json({ message: "Student deleted successfully" });
        } else {
            res.status(404).json({ message: "Student not found" });
        }
    } catch (error) {
        res.status(500).json({ message: "Error deleting student", error });
    }
});


// Middleware for admin authentication
const adminAuth = (req, res, next) => {
    if (!req.session.admin) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    next();
};








// Start server
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
