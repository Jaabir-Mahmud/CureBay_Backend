// seed/seedUsers.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../src/models/User"); // Your User model

dotenv.config();

// Connect ONLY ONCE
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/curebay";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🔥 Connected, now seeding...");

    // Clear old data
    await User.deleteMany({});

    // Create only the admin user
    const adminUser = {
      name: "Admin",
      email: "admin@curebay.com",
      password: "admin123", // hash this in production!
      role: "admin"
    };

    await User.create(adminUser);

    console.log("✅ Admin user inserted.");
    process.exit();
  })
  .catch((err) => {
    console.error("❌ Seeding error:", err);
    process.exit(1);
  });
