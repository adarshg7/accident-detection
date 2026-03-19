const mongoose = require('mongoose');
const dotenv = require('dotenv');
const GovOfficial = require('../models/GovOfficial');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const promote = async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Please provide an email: node promoteAdmin.js official@example.com');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const official = await GovOfficial.findOne({ email });
    if (!official) {
      console.error('Official not found with email:', email);
      process.exit(1);
    }

    official.role = 'admin';
    official.isApproved = true;
    await official.save();

    console.log(`SUCCESS: ${email} is now an Admin and Approved! 🛡️`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

promote();
