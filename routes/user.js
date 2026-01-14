import express from "express";
import User from "../models/User.js";

const router = express.Router();

// POST: Add new user
router.post("/", async (req, res) => {
  try {
    const { name, email, role} = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const newUser = new User({ name, email, role});
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET user by email
router.get("/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT: update name & role only
router.put("/:email", async (req, res) => {
  const { email } = req.params;
  const { name, role } = req.body;
  try {
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: { name, role } },
      { new: true }
    );
    if (!updatedUser) return res.status(404).json({ message: "User not found" });
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



export default router;
