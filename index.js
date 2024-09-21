const {MongoClient,ServerApiVersion} = require('mongodb');
const Express = require('express');
const cors = require('cors');
const multer = require('multer');


const app = Express();
app.use(cors());

const dburl="mongodb+srv://punithshanakanahalli:RaPufoHFjZl6eFtd@cluster0.ziyvd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const databasename="social_media";
let database;

async function connecttomongodb() {
    try{
        const client=new MongoClient(dburl,{
            serverApi:{
                version:ServerApiVersion.v1,
                strict:true,
                deprecationErrors:true,
            },
        });
        await client.connect();
        database=client.db(databasename);
        console.log("mongoDb connection successful");
    }catch(error){
        console.error("mongodb conecction failed:",error);
    }
}

app.get('/api/social_media/getinfo', async (req, res) => {
    if (!database) {
        return res.status(500).send("database not connected");
    }
    try {
        const result = await database.collection("user").find({}).toArray();
        console.log(result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "error fetching data", error });
    }
});

//start server
app.listen(5038,()=>{
    console.log("server is running on port 5038")
    connecttomongodb();
})