
const { MongoClient, ServerApiVersion,GridFSBucket } = require('mongodb');
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
const gridfsStream = require('gridfs-stream');
// import { WebSocketServer } from 'ws';
const WebSocketServer = require('ws').WebSocketServer;
let gfs; // Global variable for GridFS Stream
let gridfsBucket; // GridFSBucket for file storage

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
        
        // Initialize GridFS Stream and GridFSBucket
        gridfsBucket = new GridFSBucket(database, { bucketName: 'uploads' });
        gfs = gridfsStream(client.db(databasename), mongoose.mongo);
        gfs.collection('uploads');

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
      // Check if the user exists in the "user" collection
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
      const userIdString = user._id.toString();
      // Check if the user is blocked by admin
      const isBlocked = await database.collection('block').findOne({
        blockedby: 'admin',
        blockedId: userIdString
      });
  
      if (isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked by the admin" });
      }
  
      // Verify the password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Invalid password" });
      }
  
      // Store user session details
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
            return res.status(400).json({ message: "follower_id and following_id are required" });
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

        // Fetch follower's user data (username and profile_pic)
        const follower = await database.collection("user").findOne(
            { _id: new ObjectId(following_id) },
            { projection: { username: 1, profile_pic: 1 } }
        );

        // Construct a follow notification with follower details
        const notification = {
            userId:follower_id, // The user receiving the notification
            senderId:following_id , // The user who initiated the follow
            type: "follow",
            message: `${follower.username} started following you!`,
            profile_pic: follower.profile_pic, // Follower's profile picture
            isRead: false,
            timestamp: new Date()
        };

        // Insert the notification into the notifications collection
        await database.collection("notification").insertOne(notification);

        // Send real-time notification to the user being followed if they are connected
        if (activeConnections[following_id]) {
            activeConnections[following_id].forEach(receiverWs => {
                receiverWs.send(JSON.stringify({
                    type: "notification",
                    data: {
                        sender_id: follower_id,
                        message: `${follower.username} started following you!`,
                        profile_pic: follower.profile_pic,
                        timestamp: new Date()
                    }
                }));
            });
        }

        res.status(201).json({ message: "Successfully followed", result });
    } catch (error) {
        if (error.code === 11000) {
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
            return res.status(400).json({ message: "follower_id and following_id are required" });
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
            // Fetch unfollower's user data (username and profile_pic)
            const unfollower = await database.collection("user").findOne(
                { _id: new ObjectId(following_id) },
                { projection: { username: 1, profile_pic: 1 } }
            );

            // Construct an unfollow notification with unfollower details
            const notification = {
                userId: follower_id, // The user receiving the notification
                senderId:following_id, // The user who initiated the unfollow
                type: "unfollow",
                message: `${unfollower.username} unfollowed you.`,
                profile_pic: unfollower.profile_pic, // Unfollower's profile picture
                isRead: false,
                timestamp: new Date()
            };

            // Insert the notification into the notifications collection
            await database.collection("notification").insertOne(notification);

            // Send real-time notification to the user being unfollowed if they are connected
            if (activeConnections[following_id]) {
                activeConnections[following_id].forEach(receiverWs => {
                    receiverWs.send(JSON.stringify({
                        type: "notification",
                        data: {
                            sender_id: follower_id,
                            message: `${unfollower.username} unfollowed you.`,
                            profile_pic: unfollower.profile_pic,
                            timestamp: new Date()
                        }
                    }));
                });
            }

            res.status(200).json({ message: "Successfully unfollowed" });
        } else {
            res.status(500).json({ message: "Failed to unfollow. Please try again." });
        }
    } catch (error) {
        console.error("Error unfollowing user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



// follow status
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


// Following
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


// Follower
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
        return res.status(400).json({ message: "Invalid user ID" });
    }

    try {
        const loggedInUserId = user_id; // Keep as string

        // Step 1: Find users the logged-in user is following
        const followingUsers = await database.collection('followers').find({
            following_id: loggedInUserId
        }).toArray();
        console.log("following",followingUsers);
        const followingUserIds = followingUsers.map(follow => follow.follower_id);

        // Step 2: Find users who are followed by the users the logged-in user follows
        const suggestions = await database.collection('followers').find({
            following_id: { $in: followingUserIds }
        }).toArray();
        console.log("suggestions",suggestions);
        const suggestedUserIds = suggestions
            .map(suggest => suggest.follower_id)
            .filter(id => !followingUserIds.includes(id) && id !== loggedInUserId);  // Exclude users already followed or the user themself

        // Step 3: Retrieve details of suggested users
        const suggestedUsers = await database.collection('user').find({
            _id: { $in: suggestedUserIds.map(id => new ObjectId(id)) }
        }).toArray();
        console.log("suggestedUsers",suggestedUsers);
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

// Post
app.post('/api/social_media/uploadpost', upload.single('file'), async (req, res) => {
    try {
        const { user_id, caption, type, mediaType } = req.body;

        // Input validation
        if (!req.file || !caption || type !== 'post' || !mediaType) {
            return res.status(400).json({ message: "file, caption, valid type 'post', and mediaType are required" });
        }
        if (!user_id) {
            return res.status(400).json({ message: "login required" });
        }

        // Store the file in GridFS
        const writeStream = gridfsBucket.openUploadStream(req.file.originalname, {
            metadata: {
                contentType: req.file.mimetype,
                user_id,
                caption,
                type,
                mediaType,
            }
        });

        // Write file data to GridFS
        writeStream.end(req.file.buffer);

        // Handle the file upload completion
        writeStream.on('finish', async () => {
            // Insert the post data with the fileId into the database
            const result = await database.collection("posts").insertOne({
                user_id,
                fileId: writeStream.id,  // Store GridFS fileId reference
                caption,
                type,
                mediaType,
                createdAt: new Date(),
            });

            res.status(201).json({ message: "Post uploaded successfully", result });
        });

        writeStream.on('error', (error) => {
            console.error("Error uploading file to GridFS:", error);
            res.status(500).json({ message: "Error uploading file" });
        });

    } catch (error) {
        console.error("Error uploading post:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


//Fetch story
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
      console.log("fetch posts");
  
      // Fetch the posts from the 'posts' collection
      const posts = await database.collection('posts').find({}).toArray();
  
      // Use Promise.all to fetch the user details and construct file URLs for each post
      const postsWithUserDetails = await Promise.all(posts.map(async (post) => {
        // Fetch user details
        const user = await database.collection('user').findOne(
          { _id: new ObjectId(post.user_id) }, // Convert post.user_id to ObjectId
          { projection: { username: 1, profile_pic: 1 } }
        );
  
        // Construct file URL using the post's fileId
        const fileUrl = `/api/social_media/file/${post.fileId}`;
  
        // Combine the post data with the user data and file URL
        return {
          ...post,
          user: {
            username: user?.username || 'Unknown', // Default to 'Unknown' if user not found
            profile_pic: user?.profile_pic || 'default-pic-url' // Default profile pic if not available
          },
          fileUrl // URL to access the file from GridFS
        };
      }));
  
      // Send the combined result as the response
      res.status(200).json(postsWithUserDetails);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

//block other users

  app.post('/api/social_media/user/blockuser', async (req, res) => {
    const { blockerId, blockedId } = req.body; // Blocker and blocked user IDs sent in the request body
    console.log(blockerId,blockedId , "hi");
    // Input validation
    if (!blockerId || !blockedId) {
      return res.status(400).json({ message: 'Both blockerId and blockedId are required' });
    }
  
    try {
      // Check if the user is already blocked by the blocker
      const alreadyBlocked = await database.collection('block').findOne({
        blockerId,
        blockedId,
      });
  
      if (alreadyBlocked) {
        return res.status(400).json({ message: 'User already blocked' });
      }
  
      // Insert the block record into the database
      const result = await database.collection('block').insertOne({
        blockerId,
        blockedId,
        blockedAt: new Date(), // Add a timestamp for when the block occurred
      });
  
      // Respond with a success message
      res.status(201).json({ message: 'User blocked successfully', blockId: result.insertedId });
    } catch (error) {
      console.error('Error blocking user:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  

  //posts of specific user
  app.get('/api/social_media/user_posts/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      console.log("Fetching posts for user:", userId);
  
      // Fetch the user's details once
      const userDetails = await database.collection('user').findOne(
        { _id: new ObjectId(userId) },
        { projection: { username: 1, profile_pic: 1 } }
      );
  
      // Fetch posts for the specific user
      const posts = await database.collection('posts').find({ user_id: userId }).toArray();
  
      // Count the number of posts
      const postCount = posts.length;
  
      // Construct file URLs for each post without adding user details
      const postsWithFileUrls = posts.map((post) => ({
        ...post,
        fileUrl: `/api/social_media/file/${post.fileId}` // URL to access the file from GridFS
      }));
  
      // Send the user details, post count, and posts without user details
      res.status(200).json({ 
        userDetails: {
          username: userDetails?.username || 'Unknown',
          profile_pic: userDetails?.profile_pic || 'default-pic-url'
        },
        postCount,
        posts: postsWithFileUrls
      });
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  

//   // Like a post
//   app.post('/api/social_media/post/like', async (req, res) => {
//     const { postId } = req.params;  // Get post ID from URL parameters
//     const { userId } = req.body;    // Get user ID from request body
  
//     try {
//       // Find the post by its ID to ensure it exists
//       const post = await database.collection('posts').findOne({ _id: new ObjectId(postId) });
  
//     //   if (!post) {
//     //     return res.status(404).json({ message: 'Post not found' });
//     //   }
  
//       // Check if the user has already liked the post
//       const existingLike = await database.collection('like').findOne({
//         postId: new ObjectId(postId),
//         userId: new ObjectId(userId),
//       });
  
//       if (existingLike) {
//         // If the user has already liked the post, remove the like
//         await database.collection('like').deleteOne({ _id: existingLike._id });
  
//         // Optionally, send a notification (e.g., "User X removed their like from your post")
//         const notification = {
//           userId: post.userId, // The user who created the post
//           type: 'like_removed',
//           message: `${userId} removed their like from your post`,
//           postId: new ObjectId(postId),
//           timestamp: new Date(),
//         };
//         await database.collection('notification').insertOne(notification);
  
//         return res.status(200).json({ message: 'Like removed' });
//       } else {
//         // If the user hasn't liked the post yet, insert a new like
//         await database.collection('like').insertOne({
//           postId: new ObjectId(postId),
//           userId: new ObjectId(userId),
//           like: true, // Boolean indicating like status
//           timestamp: new Date(),
//         });
  
//         // Optionally, create a notification for the post owner
//         const notification = {
//           userId: post.userId,  // The user who created the post
//           type: 'like',
//           message: `${userId} liked your post`,
//           postId: new ObjectId(postId),
//           timestamp: new Date(),
//         };
//         await database.collection('notification').insertOne(notification);
  
//         return res.status(200).json({ message: 'Post liked' });
//       }
//     } catch (error) {
//       console.error('Error liking post:', error);
//       res.status(500).json({ message: 'Server error' });
//     }
//   });
  

//store LIKE API
app.post('/api/social_media/post/like', async (req, res) => {
  const { postId } = req.body;  // postId from request body
  const { userId } = req.body;  // userId from request body

  try {
    // Ensure the post exists
    const post = await database.collection('posts').findOne({ _id: new ObjectId(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if the user has already liked the post
    const existingLike = await database.collection('like').findOne({
      postId: new ObjectId(postId),
      userId: new ObjectId(userId),
    });

    if (existingLike) {
      // If the user has already liked the post, remove the like
      await database.collection('like').deleteOne({ _id: existingLike._id });

      // Optionally, send a notification when the like is removed
      const notification = {
        userId: post.userId,  // The post author's userId
        type: 'like_removed',
        message: `${userId} removed their like from your post`,
        postId: new ObjectId(postId),
        timestamp: new Date(),
      };
      await database.collection('notification').insertOne(notification);

      return res.status(200).json({ message: 'Like removed' });
    } else {
      // If the user hasn't liked the post, insert a new like
      await database.collection('like').insertOne({
        postId: new ObjectId(postId),
        userId: new ObjectId(userId),
        like: true,
        timestamp: new Date(),
      });

      // Optionally, create a notification for the post owner
      const notification = {
        userId: post.userId,  // The post author's userId
        type: 'like',
        message: `${userId} liked your post`,
        postId: new ObjectId(postId),
        timestamp: new Date(),
      };
      await database.collection('notification').insertOne(notification);

      return res.status(200).json({ message: 'Post liked' });
    }
  } catch (error) {
    console.error('Error storing like:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


  app.get('/api/social_media/file/:id', async (req, res) => {
    try {
      const fileId = new ObjectId(req.params.id);
      console.log(fileId);
      // Find the file in GridFS
      const file = await database.collection('uploads.files').findOne({ _id: fileId });
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
  
      // Set the content type and stream the file from GridFS
      const readStream = gridfsBucket.openDownloadStream(fileId);
      res.set('Content-Type', file.metadata.contentType);
      readStream.pipe(res);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  

// fetch videos
app.get('/api/social_media/posts/videos', async (req, res) => {
    try {
      console.log("Fetching video posts");
  
      // Fetch only video posts from the 'posts' collection
      const videoPosts = await database.collection('posts').find({ mediaType: 'video' }).toArray();
  
      // Use Promise.all to fetch user details and construct file URLs for each video post
      const videoPostsWithUserDetails = await Promise.all(videoPosts.map(async (post) => {
        // Fetch user details
        const user = await database.collection('user').findOne(
          { _id: new ObjectId(post.user_id) },
          { projection: { username: 1, profile_pic: 1 } }
        );
  
        // Construct file URL using the post's fileId
        const fileUrl = `/api/social_media/file/${post.fileId}`;
  
        // Combine the post data with the user data and file URL
        return {
          ...post,
          user: {
            username: user?.username || 'Unknown', // Default to 'Unknown' if user not found
            profile_pic: user?.profile_pic || 'default-pic-url' // Default profile pic if not available
          },
          fileUrl // URL to access the video file from GridFS
        };
      }));
  
      // Send the combined result as the response
      res.status(200).json(videoPostsWithUserDetails);
    } catch (error) {
      console.error("Error fetching video posts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  

  //fetch notification
  app.get('/api/social_media/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    console.log(userId);
    try {
        // Step 1: Fetch notifications for the given userId
        const notifications = await database.collection("notification")
            .find({ userId, isRead: false })   // Fetch only unread notifications; remove isRead to get all
            .sort({ timestamp: -1 })           // Sort by most recent first
            .toArray();
        console.log(notifications);
        // Step 2: Extract unique senderIds from notifications
        const senderIds = [...new Set(notifications.map(n => n.senderId))];
        console.log(senderIds);
        // Step 3: Fetch user details for each unique senderId
        const users = await database.collection("users")
            .find({ _id: { $in: senderIds } })
            .project({ username: 1, profilePic: 1 })
            .toArray();
        console.log(users);
        // Step 4: Map user details by senderId for easier access
        const userMap = users.reduce((acc, user) => {
            acc[user._id] = {
                username: user.username,
                profilePic: user.profilePic || "https://via.placeholder.com/150" // Set default if empty
            };
            return acc;
        }, {});

        // Step 5: Combine notifications with their sender details
        const enrichedNotifications = notifications.map(notification => ({
            ...notification,
            senderDetails: userMap[notification.senderId] || {}
        }));

        // Send response with enriched notifications
        res.status(200).json({ notifications: enrichedNotifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//report user
app.post('/api/social_media/report', upload.single('file'), async (req, res) => {
    try {
        const { reporter_id, reported_user_id, feedback } = req.body;

        // Input validation
        if (!req.file || !feedback || !reported_user_id) {
            return res.status(400).json({ message: "file (screenshot), feedback, and reported_user_id are required" });
        }
        if (!reporter_id) {
            return res.status(400).json({ message: "login required" });
        }

        // Store the file in GridFS
        const writeStream = gridfsBucket.openUploadStream(req.file.originalname, {
            metadata: {
                contentType: req.file.mimetype,
                reporter_id,
                reported_user_id,
                feedback,
            }
        });

        // Write file data to GridFS
        writeStream.end(req.file.buffer);

        // Handle the file upload completion
        writeStream.on('finish', async () => {
            // Insert the report data with the fileId into the database
            const result = await database.collection("reports").insertOne({
                reporter_id,
                reported_user_id,
                fileId: writeStream.id, // Store GridFS fileId reference
                feedback,
                createdAt: new Date(),
            });

            res.status(201).json({ message: "Report submitted successfully", result });
        });

        writeStream.on('error', (error) => {
            console.error("Error uploading file to GridFS:", error);
            res.status(500).json({ message: "Error uploading screenshot" });
        });

    } catch (error) {
        console.error("Error reporting user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



//fetch reports
app.get('/api/social_media/reports', async (req, res) => {
    try {
        console.log("Fetching reports");

        // Fetch all reports from the 'reports' collection
        const reports = await database.collection('reports').find({}).toArray();

        // Use Promise.all to fetch user details and construct file URLs for each report
        const reportsWithDetails = await Promise.all(reports.map(async (report) => {
            // Fetch reporter details
            const reporter = await database.collection('user').findOne(
                { _id: new ObjectId(report.reporter_id) },
                { projection: { username: 1, profile_pic: 1 } }
            );

            // Fetch reported user details
            const reportedUser = await database.collection('user').findOne(
                { _id: new ObjectId(report.reported_user_id) },
                { projection: { username: 1, profile_pic: 1 } }
            );

            // Construct file URL using the report's fileId
            const fileUrl = `/api/social_media/file/${report.fileId}`;

            // Combine the report data with user details and file URL
            return {
                ...report,
                reporter: {
                    username: reporter?.username || 'Unknown', // Default to 'Unknown' if user not found
                    profile_pic: reporter?.profile_pic || 'default-reporter-pic-url' // Default reporter profile pic
                },
                reported_user: {
                    username: reportedUser?.username || 'Unknown', // Default to 'Unknown' if user not found
                    profile_pic: reportedUser?.profile_pic || 'default-reported-user-pic-url' // Default reported user profile pic
                },
                fileUrl // URL to access the screenshot file from GridFS
            };
        }));

        // Send the combined result as the response
        res.status(200).json(reportsWithDetails);
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({ message: "Internal server error" });
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

//fetch all blocked users
// Fetch blocked users
app.get('/api/social_media/admin/blocked-users', async (req, res) => {
    try {
        // Find all entries in the "block" collection where blockedby is "admin"
        const blockedUsers = await database.collection("block").find({ blockedby: 'admin' }).toArray();

        // Extract the blocked user IDs
        const blockedIds = blockedUsers.map(entry => entry.blockedId);

        // Fetch user details for each blocked ID from the "user" collection
        const users = await database.collection("user").find({ _id: { $in: blockedIds.map(id => new ObjectId(id)) } }).toArray();

        res.json({ users });
    } catch (error) {
        console.error('Error fetching blocked users:', error);
        res.status(500).json({ message: "Error fetching blocked users", error });
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

app.post('/api/social_media/admin/blockuser/:userId', async (req, res) => {
    const { userId } = req.params;
    const blockedId = userId;
    const blockedby = 'admin';
    console.log(userId);
    try {
      // Check if the user is already blocked by the admin
      const alreadyBlocked = await database.collection('block').findOne({
        blockedby,
        blockedId,
      });
  
      if (alreadyBlocked) {
        return res.status(400).json({ message: 'User already blocked' });
      }
  
      // Insert the block record into the database
      const result = await database.collection('block').insertOne({ blockedby, blockedId });
  
      // Respond with a success message
      res.status(201).json({ message: 'User blocked successfully' });
    } catch (error) {
      console.error('Error blocking user:', error);
      res.status(500).json({ message: 'Internal server error' });
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
  

// POST route to log in as an admin
app.post('/api/social_media/addadmin/login', async (req, res) => {
    console.log('Login attempt:', req.body);
    const { mobileOrEmailOrUsername, password } = req.body;

    try {
        const admin = await database.collection('admins').findOne({
            $or: [
                { email: mobileOrEmailOrUsername },
                { phone: mobileOrEmailOrUsername },
                { username: mobileOrEmailOrUsername },
            ],
        });

        if (!admin) {
            console.log('Admin not found');
            return res.status(404).json({ message: 'Admin not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            console.log('Invalid password');
            return res.status(401).json({ message: 'Invalid password' });
        }

        console.log('Admin logged in:', admin._id);
        res.status(200).json({
            message: 'Login successful',
            admin: { id: admin._id, name: admin.name },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

  

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
      const admins = await database.collection('admins').find().toArray(); // Fetch all admins from the database
      if (admins.length === 0) {
        return res.status(404).json({ message: 'No admins found' });
      }
      res.json({ admins });
    } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({ message: 'Error fetching admin data' });
    }
  });
  
  // POST route to add a new admin
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


// API endpoint to get all staff members
app.get('/api/social_media/admin/staff', async (req, res) => {
    try {
        // Retrieve all staff entries from the "staff" collection
        const staff = await database.collection("staff").find().toArray();

        // Return the staff data
        res.status(200).json({ staff });
    } catch (error) {
        console.error('Error fetching staff data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// API endpoint to delete a staff member by ID
app.delete('/api/social_media/admin/deletestaff/:id', async (req, res) => {
    const staffId = req.params.id;

    try {
        // Delete staff member from the database
        const result = await database.collection("staff").deleteOne({ _id: new ObjectId(staffId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        res.status(200).json({ message: 'Staff member deleted successfully' });
    } catch (error) {
        console.error('Error deleting staff member:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// API endpoint to update a staff member by ID
app.put('/api/social_media/admin/editstaff/:id', async (req, res) => {
    const staffId = req.params.id;
    const { name, email, department, mobile } = req.body;

    // Validate request body (ensure no field is empty)
    if (!name || !email || !department || !mobile) {
        console.error('Validation Error: All fields are required');
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Check if another staff member with the same email or mobile already exists
        const existingStaff = await database.collection("staff").findOne({
            $or: [{ email }, { mobile }],
            _id: { $ne: new ObjectId(staffId) }
        });
        if (existingStaff) {
            console.error('Error: Staff member with this email or mobile already exists');
            return res.status(400).json({ message: 'Staff member with this email or mobile already exists' });
        }

        // Update the staff member in the database
        const result = await database.collection("staff").updateOne(
            { _id: new ObjectId(staffId) },
            { $set: { name, email, department, mobile } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        res.status(200).json({ message: 'Staff updated successfully' });
    } catch (error) {
        console.error('Error updating staff member:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});





app.get('/api/social_media/messages/:sender_id/:receiver_id', async (req, res) => {
    const { sender_id, receiver_id } = req.params;
    console.log("sender",sender_id,"reciver",receiver_id);
    try {
        const messages = await database.collection('messages').find({
            $or: [
                { sender_id, receiver_id },
                { sender_id: receiver_id, receiver_id: sender_id }
            ]
        })
        .sort({ timestamp: 1 })  // Sort messages by timestamp in ascending order
        .toArray();

        // Add "direction" attribute to each message
        const formattedMessages = messages.map(message => ({
            ...message,
            direction: message.sender_id === sender_id ? 'sent' : 'received'
        }));
        console.log(formattedMessages);
        res.json({ messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//delete the mesages
app.post('/api/social_media/messages/delete', async (req, res) => {
    const { messageIds } = req.body;
    try {
      await database.collection('messages').deleteMany({
        _id: { $in: messageIds.map(id => new ObjectId(id)) }
      });
      res.json({ message: 'Messages deleted successfully' });
    } catch (error) {
      console.error('Error deleting messages:', error);
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
const activeConnections = {}; // Store user connections by user ID

wss.on('connection', ws => {
    console.log('New client connected');

    ws.on('message', async data => {
        const parsedData = JSON.parse(data);
        const { sender_id, receiver_id, message } = parsedData;

        // Store this connection under sender's ID for identification
        if (!activeConnections[sender_id]) {
            activeConnections[sender_id] = [];
        }
        activeConnections[sender_id].push(ws);

        try {
            const followStatus = await database.collection('followers').findOne({
                follower_id: sender_id,
                following_id: receiver_id
            });

            if (!followStatus) {
                ws.send('This user is not following you, you cannot send messages to this account.');
                return;
            }

            console.log('Message received:', message);
            
            // Broadcast message to receiver's active connections
            if (activeConnections[receiver_id]) {
                activeConnections[receiver_id].forEach(receiverWs => {
                    receiverWs.send(JSON.stringify({ sender_id, message }));
                });
            }

            // Insert the message into the database
            await database.collection('messages').insertOne({
                sender_id,
                receiver_id,
                message,
                timestamp: new Date()
            });

            // Add notification for the receiver
            const notification = {
                userId: receiver_id, // The user receiving the notification
                senderId: sender_id, // The user who sent the message
                type: "message",
                message: "You have a new message",
                isRead: false,
                timestamp: new Date()
            };

            // Insert the notification into the notifications collection
            await database.collection("notification").insertOne(notification);

            // Send real-time notification to receiver if connected
            if (activeConnections[receiver_id]) {
                activeConnections[receiver_id].forEach(receiverWs => {
                    receiverWs.send(JSON.stringify({
                        type: "notification",
                        data: {
                            sender_id,
                            message: "You have a new message",
                            timestamp: new Date()
                        }
                    }));
                });
            }

        } catch (error) {
            console.error('Error handling message:', error);
            ws.send('Error processing your message.');
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // Remove closed connection from activeConnections
        Object.keys(activeConnections).forEach(userId => {
            activeConnections[userId] = activeConnections[userId].filter(conn => conn !== ws);
            if (activeConnections[userId].length === 0) delete activeConnections[userId];
        });
    });
});

