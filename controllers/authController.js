const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { error } = require("qrcode-terminal");


const register = async (req, res) => {
  try {
    const { fullName, email, password, role, farmName, preferences } = req.body;

    if (role === "farmer" && !farmName) {
      return res.status(400).json({ error: "Farm name is required" });
    }

    if (role === "buyer" && (!preferences || !Array.isArray(preferences))) {
      return res.status(400).json({ error: "Preferences array is required" });
    }


    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "User is existing already" });
    }

    if (!/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/.test(password)) {
  return res.status(400).json({ 
    error: "Password must contain 8+ chars with uppercase, lowercase and numbers"
  });
}

    const hashedPassword = await bcrypt.hash(password,12)
    
    const newUser = await User.create({
      fullName,
      email,
      password:hashedPassword,
      role,
      ...(role==='farmer' && {
        farmName
      }),
      ...(role==='buyer' && {
        preferences
      })
    })
    
    const token = jwt.sign(
       {userId: newUser._id, role:newUser.role},
       process.env.JWT_SECRET,
       {expiresIn:'1d'}
   )
    return res.status(201).json({
        message:"User created Successfully",
        token,
        user:{
            _id:newUser._id,
            fullName: newUser.fullName,
             email: newUser.email, 
             role: newUser.role,
            ...(role === 'farmer' && { farmName: newUser.farmName })
        }
    })
  } catch (error) {
    console.log('Registration error', error.message); 
    return res.status(500).json({message:"Error creating user", error})
  }
};


const login = async(req,res)=>{
  const {email,password} = req.body
  try {
    if(!email || !password){
      return res.status(400).json({error:"All fields are required"})
    }

    const user = await User.findOne({email})
    if(!user){
      return res.status(401).json({error:'Invalid credentials'})
    }

    const isPasswordValid = await bcrypt.compare(password,user.password)
    if(!isPasswordValid){
      return res.status(400).json({message:"Invalid credentials"})
    }

     const token = jwt.sign(
       {userId: user._id, role:user.role},
       process.env.JWT_SECRET,
       {expiresIn:'1d'}
   )

     return res.status(201).json({
        message:"Logged in successfully",
        token, 
        user:{
            _id:user._id,
            fullName: user.fullName,
             email: user.email,  
            role:user.role,
            ...(user.role === 'farmer' && { farmName: user.farmName })
        }
    })

  } catch (error) {
    console.log(' logging in ',error.message);
    return res.status(500).json({message:" logging failed ",error})
  }
}
 

module.exports = {
  register,
  login
}