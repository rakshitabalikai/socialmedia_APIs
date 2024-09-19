const { MongoClient, ServerApiVersion } = require('mongodb');
const Express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = Express();
app.use(cors());

// MongoDB connection configuration
const CONNECTION_STRING = "mongodb+srv://punithshanakanahalli:RaPufoHFjZl6eFtd@cluster0.ziyvd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DATABASENAME = "social_networking";
let database;

// Async function to connect to MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(CONNECTION_STRING, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });
        await client.connect();
        database = client.db(DATABASENAME);
        console.log("MongoDB connection successful");
    } catch (error) {
        console.error("MongoDB connection failed:", error);
    }
}

// Route to get chat information
app.get('/api/social_networking/getinfo', async (req, res) => {
    if (!database) {
        return res.status(500).send("Database not connected");
    }

    try {
        const result = await database.collection("real_time_chat").find({}).toArray();
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching data", error });
    }
});

// app.post('/api/social_networking/putinfo',multer().none(),(request,response)=>{
//     database.collection("real_time_chat").count({},function(error,numofDocs){
//         database.collection("real_time_chat").insertOne({
//             id:(numofDocs+1).toString(),
//             description
//         })
//     })
// })
// Start the server and connect to MongoDB
app.listen(5038, () => {
    console.log("Server is running on port 5038");
    connectToMongoDB();
});