
const { MongoClient, ServerApiVersion } = require('mongodb');
const Express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const http = require('http'); // Import http module
const app = Express();
const { Server } = require("socket.io");
const { ObjectId } = require('mongodb');
// import { WebSocketServer } from 'ws';
const WebSocketServer = require('ws').WebSocketServer;


// Create an HTTP server
// Initialize socket.io with the HTTP server
// const io = new Server(server, {
//     cors: {
//         origin: "http://localhost:3000", // Allow your React app to connect
//         methods: ["GET", "POST"]
//     }
// });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '200mb' })); // Setting limit to 200MB for JSON bodies
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true })); // Same limit for URL-encoded data
app.use(Express.json());

// Session Middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
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

// Error Handling Middleware for Payload Too Large
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(413).json({ message: "File is too large. Maximum allowed size is 200MB." });
    } else if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: "Request payload is too large." });
    }
    next(err);
});

// io connection
// io.on("connection", (socket) => {
//     console.log("A user connected:", socket.id);

//     // Handle socket events, e.g., receiving messages
//     socket.on('sendMessage', (message) => {
//         console.log("Message received:", message);
//         // Broadcast message to all connected clients
//         io.emit('receiveMessage', message);
//     });

//     // Handle disconnection
//     socket.on("disconnect", () => {
//         console.log("User disconnected:", socket.id);
//     });
// });



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
        const { follower_id, following_id } = req.body;

        // Input validation
        if (!follower_id || !following_id) {
            return res.status(400).json({ message: "follower and user_id are required" });
        }

        // Check if the user is already following the other user
        const existingFollow = await database.collection("followers").findOne({
            follower_id,
            following_id
        });

        if (existingFollow) {
            return res.status(400).json({ message: "You are already following this user." });
        }

        // Insert the follow data into the database
        const result = await database.collection("followers").insertOne({
            follower_id,
            following_id
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
 
app.post('/api/social_media/unfollow', async (req, res) => {
    try {
        const { follower_id, following_id } = req.body;

        // Input validation
        if (!follower_id || !following_id) {
            return res.status(400).json({ message: "follower and user_id are required" });
        }

        // Check if the user is actually following the other user
        const existingFollow = await database.collection("followers").findOne({
            follower_id,
            following_id
        });

        if (!existingFollow) {
            return res.status(400).json({ message: "You are not following this user." });
        }

        // Remove the follow data from the database
        const result = await database.collection("followers").deleteOne({
            follower_id,
            following_id
        });

        if (result.deletedCount === 1) {
            res.status(200).json({ message: "Successfully unfollowed" });
        } else {
            res.status(500).json({ message: "Failed to unfollow. Please try again." });
        }
    } catch (error) {
        console.error("Error unfollowing user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});




app.get('/api/social_media/follow_stats/:user_id', async (req, res) => {
    const { user_id } = req.params;
    console.log('User ID:', user_id);

    try {
        // Don't convert user_id to ObjectId since it's stored as a string
        const userIdStr = user_id;

        // Count the number of people the user is following
        const followersCount = await database.collection('followers').countDocuments({ follower_id: userIdStr });

        // Count the number of people following the user
        const followingCount = await database.collection('followers').countDocuments({ following_id: userIdStr });

        console.log('Followers:', followersCount, 'Following:', followingCount);

        res.status(200).json({
            followingCount,
            followersCount
        });
    } catch (error) {
        console.error("Error fetching follow stats:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



app.get('/api/social_media/following/:user_id', async (req, res) => {
    const { user_id } = req.params;

    if (!ObjectId.isValid(user_id)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
        const loggedInUserId = user_id;

        // Step 1: Find all entries in 'followers' collection where 'follower' matches loggedInUserId
        const followedUsers = await database.collection('followers').find({
            following_id: loggedInUserId
        }).toArray();
        console.log("followedUsers",followedUsers);

        if (followedUsers.length === 0) {
            return res.status(404).json({ message: "You are not following anyone." });
        }

        // Step 2: Extract the user_ids of the users being followed
        const followedUserIds = followedUsers.map(follow => follow.follower_id);

        // Step 3: Ensure proper conversion to ObjectId if needed
        const followedObjectIds = followedUserIds.map(id => ObjectId.isValid(id) ? new ObjectId(id) : null).filter(Boolean);

        // Step 4: Retrieve details of the users being followed from the 'user' collection
        const users = await database.collection('user').find({
            _id: { $in: followedObjectIds }
        }).toArray();
        console.log("followedObjectIds",followedObjectIds);

        // If no users are found, return an empty array
        if (users.length === 0) {
            return res.status(404).json({ message: "No users found." });
        }

        // Return necessary user details
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
        console.log("result",result);

        res.status(200).json({ users: result });
    } catch (error) {
        console.error("Error fetching following users:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
});


app.get('/api/social_media/follower/:user_id', async (req, res) => {
    const { user_id } = req.params;

    if (!ObjectId.isValid(user_id)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
        const loggedInUserId = user_id;

        // Step 1: Find all entries in 'followers' collection where 'follower' matches loggedInUserId
        const followedUsers = await database.collection('followers').find({
            follower_id: loggedInUserId
        }).toArray();
        console.log("followedUsers",followedUsers);

        if (followedUsers.length === 0) {
            return res.status(404).json({ message: "You are not following anyone." });
        }

        // Step 2: Extract the user_ids of the users being followed
        const followedUserIds = followedUsers.map(follow => follow.following_id);

        // Step 3: Ensure proper conversion to ObjectId if needed
        const followedObjectIds = followedUserIds.map(id => ObjectId.isValid(id) ? new ObjectId(id) : null).filter(Boolean);

        // Step 4: Retrieve details of the users being followed from the 'user' collection
        const users = await database.collection('user').find({
            _id: { $in: followedObjectIds }
        }).toArray();
        console.log("followedObjectIds",followedObjectIds);

        // If no users are found, return an empty array
        if (users.length === 0) {
            return res.status(404).json({ message: "No users found." });
        }

        // Return necessary user details
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
        console.log("result",result);

        res.status(200).json({ users: result });
    } catch (error) {
        console.error("Error fetching following users:", error);
        res.status(500).json({ message: "Internal server error", error });
    }
});


//suggestion API
app.get('/api/social_media/suggestions/:user_id', async (req, res) => {
    const { user_id } = req.params;
    console.log(user_id);

    if (!ObjectId.isValid(user_id)) {
        console.log(user_id);
        return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
        const loggedInUserId = new ObjectId(user_id);

        // Step 1: Find users the logged-in user is following
        const followingUsers = await database.collection('followers').find({
            following_id: loggedInUserId
        }).toArray();
        console.log(followingUsers);
        const followingUserIds = followingUsers.map(follow => new ObjectId(follow.follower_id));
    
        // Step 2: Find users who are followed by the users the logged-in user follows
        const suggestions = await database.collection('followers').find({
            following_id: { $in: followingUserIds }
        }).toArray();
        console.log(suggestions);
        
        const suggestedUserIds = suggestions
            .map(suggest => suggest.follower_id)
            .filter(id => !followingUserIds.includes(id) && !id.equals(loggedInUserId));  // Exclude users already followed or the user themself
        console.log("suggestedUsers",suggestedUserIds);
        // Step 3: Retrieve details of suggested users
        const suggestedUsers = await database.collection('user').find({
            _id: { $in: suggestedUserIds }
        }).toArray();

        // Return necessary user details
        const result = suggestedUsers.map(user => ({
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            bio: user.bio,
            gender: user.gender,
            dateOfBirth: user.dateOfBirth,
            profile_pic: user.profile_pic,
            accountPrivacy: user.accountPrivacy
        }));
        
        res.status(200).json({ suggestedUsers: result });
    } catch (error) {
        console.error("Error fetching suggested users:", error);
        res.status(500).json({ message: "Internal server error", error });
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

app.post('/api/social_media/uploadpost', async (req, res) => {
    try {
        const { user_id, file, caption, type } = req.body;
        console.log(user_id,caption,type);
        // Input validation
        if (!file || !caption || type !== 'post') {
            return res.status(400).json({ message: "file, caption, and valid type 'post' are required" });
        }
        if ( !user_id){
            return res.status(400).json({message: "login required"});
        }
        // Insert the post data into the database
        const result = await database.collection("posts").insertOne({
            user_id,
            file,
            caption,
            type,
            createdAt: new Date(),
        });

        res.status(201).json({ message: "Post uploaded successfully", result });
    } catch (error) {
        console.error("Error uploading post:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post('/api/social_media/uploadstory', async (req, res) => {
    try {
        const { user_id,file, caption, type } = req.body;

        // Input validation
        if (!file || !caption || type !== 'story') {
            return res.status(400).json({ message: "file, caption, and valid type 'story' are required" });
        }

        // Insert the story data into the database
        const result = await database.collection("story").insertOne({
            user_id,
            file,
            caption,
            type,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Story expires in 24 hours
        });

        res.status(201).json({ message: "Story uploaded successfully", result });
    } catch (error) {
        console.error("Error uploading story:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Fetch posts
app.get('/api/social_media/posts', async (req, res) => {
  try {
    // Fetch the posts from the 'posts' collection
    const posts = await database.collection('posts').find({}).toArray();

    // Use Promise.all to fetch the user details for each post
    const postsWithUserDetails = await Promise.all(posts.map(async (post) => {
      // Convert the user_id from the post to ObjectId
      const user = await database.collection('user').findOne(
        { _id:new ObjectId(post.user_id) }, // Convert post.user_id to ObjectId
        { projection: { username: 1, profile_pic: 1 } }
      );

      // Combine the post data with the user data
      return {
        ...post,
        user: {
          username: user?.username || 'Unknown', // If user not found, default to 'Unknown'
          profile_pic: user?.profile_pic || 'default-pic-url' // Default profile pic if not available
        }
      };
    }));
    
    // Log for debugging
    // console.log(postsWithUserDetails);

    // Send the combined result as the response
    res.status(200).json(postsWithUserDetails);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

  

  // Fetch stories
  app.get('/api/social_media/stories', async (req, res) => {
    try {
      const stories = await database.collection('stories').find({}).toArray();
      res.status(200).json(stories); // Send JSON response
    } catch (error) {
      console.error('Error fetching stories:', error);
      res.status(500).json({ message: 'Internal server error' });
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

// Delete a user
app.delete('/api/social_media/admin/deleteuser/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // 1. Delete the user's posts
        await database.collection("post").deleteMany({ authorId: new ObjectId(userId) });

        // 2. Delete the user's comments
        await database.collection("comment").deleteMany({ userId: new ObjectId(userId) });

        // 3. Remove the user's likes from posts
        await database.collection("post").updateMany(
            { likes: new ObjectId(userId) },
            { $pull: { likes: new ObjectId(userId) } }
        );

        // 4. Remove the user from other users' followers lists
        await database.collection("user").updateMany(
            { followers: new ObjectId(userId) },
            { $pull: { followers: new ObjectId(userId) } }
        );

        // 5. Delete the user
        const result = await database.collection("user").deleteOne({ _id: new ObjectId(userId) });

        if (result.deletedCount > 0) {
            res.json({ message: "User and all related data deleted successfully" });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: "Error deleting user", error });
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

app.post('/api/social_media/Edit_student', async (req, res) => {
    const { _id, name, email, mobile, gender, dateOfBirth, usn } = req.body;
  
    // Validate request body
    if (!_id || !name || !email || !mobile || !gender || !dateOfBirth || !usn) {
      return res.status(400).json({ message: 'All fields are required' });
    }
  
    try {
      // Find the student by _id and update their profile
      const student = await Student.findById(_id);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
  
      student.name = name;
      student.email = email;
      student.mobile = mobile;
      student.gender = gender;
      student.dateOfBirth = dateOfBirth;
      student.usn = usn;
  
      await student.save(); // Save the updated profile
  
      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // Start the server
//   const PORT = process.env.PORT || 5038;
//   app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//   });
  
app.post('/api/social_media/admin/addstudent', async (req, res) => {
    const { name, email, mobile, gender, dateOfBirth, usn } = req.body;

    // Debugging log
    console.log('Received data:', req.body);

    // Validate request body
    if (!name || !email || !mobile || !gender || !dateOfBirth || !usn) {
        console.error('Validation Error: All fields are required');
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Check if a student with the same USN already exists
        const existingStudent = await database.collection("students").findOne({ usn });
        if (existingStudent) {
            console.error('Error: Student with this USN already exists');
            return res.status(400).json({ message: 'Student with this USN already exists' });
        }

        // Create a new student object
        const newStudent = {
            name,
            email,
            mobile,
            gender,
            dateOfBirth: new Date(dateOfBirth), // Ensure the date is stored correctly
            usn,
        };

        // Insert the new student into the database
        await database.collection("students").insertOne(newStudent);
        console.log('Student added:', newStudent); // Log the newly created student
        res.status(201).json({ message: 'Student added successfully', student: newStudent });
    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET route to fetch all admins
app.get('/api/social_media/admin', async (req, res) => {
    try {
      const admins = await Admin.find(); // Fetch all admins from the database
      if (admins.length === 0) {
        return res.status(404).json({ message: 'No admins found' });
      }
      res.json({ admins });
    } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({ message: 'Error fetching admin data' });
    }
  });

  app.post('/api/social_media/admin/addadmin', async (req, res) => {
    const { name, email, password, phoneNumber } = req.body;

    // Input validation
    if (!name || !email || !password || !phoneNumber) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Check if admin with the same email or phone number already exists
        const existingAdmin = await database.collection('admins').findOne({
            $or: [{ email }, { phone: phoneNumber }]
        });

        if (existingAdmin) {
            return res.status(400).json({ message: 'Admin with this email or phone number already exists' });
        }

        // Ensure strong password hashing
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new admin object
        const newAdmin = {
            name,
            email,
            password: hashedPassword, // Save hashed password
            phone: phoneNumber,
        };

        // Insert the new admin into the database
        const result = await database.collection('admins').insertOne(newAdmin);

        // Respond with the inserted admin's ID
        res.status(201).json({ message: 'Admin added successfully', adminId: result.insertedId });
    } catch (error) {
        console.error('Error adding admin:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
  //addstaff
// Define staff schema and model
app.post('/api/social_media/admin/addstaff', async (req, res) => {
    const { name, email, department, mobile } = req.body;

    // Debugging log to check the received data
    console.log('Received staff data:', req.body);

    // Validate request body (ensure no field is empty)
    if (!name || !email || !department || !mobile) {
        console.error('Validation Error: All fields are required');
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Check if a staff member with the same email or mobile already exists
        const existingStaff = await database.collection("staff").findOne({ 
            $or: [{ email }, { mobile }] 
        });
        if (existingStaff) {
            console.error('Error: Staff member with this email or mobile already exists');
            return res.status(400).json({ message: 'Staff member with this email or mobile already exists' });
        }

        // Create a new staff object
        const newStaff = {
            name,
            email,
            department,
            mobile,
            addedAt: new Date() // Store the time the staff was added
        };

        // Insert the new staff into the database
        await database.collection("staff").insertOne(newStaff);
        console.log('Staff added:', newStaff); // Log the newly created staff

        // Return a success response with the added staff data
        res.status(201).json({ message: 'Staff added successfully', staff: newStaff });
    } catch (error) {
        console.error('Error adding staff:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/social_media/messages/:sender_id/:receiver_id', async (req, res) => {
    const { sender_id, receiver_id } = req.params;

    try {
        const messages = await database.collection('messages').find({
            $or: [
                { sender_id, receiver_id },
                { sender_id: receiver_id, receiver_id: sender_id }  // For both directions
            ]
        }).toArray();

        res.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});




  

// Start the server
// const PORT = process.env.PORT || 4000;
// server.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
// });
// Start server
 const server=app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connecttomongodb();
});
const WebSocket = require('ws');
// const http = require('http');




// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('New client connected');
    
    ws.on('message', async data => {
        const parsedData = JSON.parse(data);
        const { sender_id, receiver_id, message } = parsedData;

        try {
            // Check if sender is following the receiver
            const followStatus = await database.collection('followers').findOne({
                follower_id: sender_id,
                following_id: receiver_id
            });

            if (!followStatus) {
                ws.send('This user is not following you,you can not send message to this account.');
                return;
            }

            console.log('Message received:', message);
            
            // Send the message to the receiver
            // Here you could broadcast the message to all or target only specific clients
            ws.send(` ${message}`);

            // Optionally store messages in the database for retrieval
            await database.collection('messages').insertOne({
                sender_id,
                receiver_id,
                message,
                timestamp: new Date()
            });

        } catch (error) {
            console.error('Error handling message:', error);
            ws.send('Error processing your message.');
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

