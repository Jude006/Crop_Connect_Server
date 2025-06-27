const mongoose = require('mongoose')

const connectDb = async()=>{
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI)
        console.log(`Mongodb connected successfully ${conn.connection.host}`);
        
    } catch (error) {
        console.log(`failed to connect to mongodb ${error}`);
        process.exit(1)
    }
}


module.exports = connectDb