const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      minlength: 2,
      default: ""
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Invalid email format",
      ],
    },
    password: {
      type: String,
      minlength: 8,
      required: true,
    },
    role: {
      type: String,
      enum: ["farmer", "buyer"],
      required: true
    },
    farmName: {
      type: String,
      required: function () {
        return this.role === "farmer";
      },
      default: ""
    },
    preferences: {
      type: [String],
      default: [],
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: {
        type: String,
        default: "Nigeria",
      },
    },
    profileImage: {
      type: String,
      default: "",
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
  },
  {
    timestamps: true, 
    toJSON: {  
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);
  
const User = mongoose.model("User", userSchema);
module.exports = User;