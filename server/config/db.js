const mongoose = require('mongoose');

const connectTODB = async () => {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      tls: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
    });
    console.log(`Database Connected`);
  } catch (error) {
    console.error('MongoDB connection failed', error);
  }
};

module.exports = connectTODB;
