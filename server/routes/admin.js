const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { cloudinary, upload } = require('../../config/cloudinary');
const cheerio = require("cheerio");

const adminLayout = '../views/layouts/admin';
const jwtSecret = process.env.JWT_SECRET;


/**
 * 
 * Check Login
*/
const authMiddleware = (req, res, next ) => {
  const token = req.cookies.token;

  if(!token) {
    return res.status(401).json( { message: 'Unauthorized'} );
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.userId;
    next();
  } catch(error) {
    res.status(401).json( { message: 'Unauthorized'} );
  }
}


/**
 * GET /
 * Admin - Login Page
*/
router.get('/admin', async (req, res) => {
  try {
    const locals = {
      title: "Admin",
      description: "Simple Blog created with NodeJs, Express & MongoDb."
    }

    res.render('admin/index', { locals, layout: adminLayout });
  } catch (error) {
    console.log(error);
  }
});


/**
 * POST /
 * Admin - Check Login
*/
router.post('/admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne( { username } );

    if(!user) {
      return res.status(401).json( { message: 'Invalid credentials' } );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if(!isPasswordValid) {
      return res.status(401).json( { message: 'Invalid credentials' } );
    }

    const token = jwt.sign({ userId: user._id}, jwtSecret );
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dashboard');

  } catch (error) {
    console.log(error);
  }
});


/**
 * GET /
 * Admin Dashboard
*/
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const locals = {
      title: 'Dashboard',
      description: 'Simple Blog created with NodeJs, Express & MongoDb.'
    }

    const data = await Post.find();
    res.render('admin/dashboard', {
      locals,
      data,
      layout: adminLayout
    });

  } catch (error) {
    console.log(error);
  }

});


/**
 * GET /
 * Admin - Create New Post
*/
router.get('/add-post', authMiddleware, async (req, res) => {
  try {
    const locals = {
      title: 'Add Post',
      description: 'Simple Blog created with NodeJs, Express & MongoDb.'
    }

    const data = await Post.find();
    res.render('admin/add-post', {
      locals,
      layout: adminLayout
    });

  } catch (error) {
    console.log(error);
  }

});  


/**
 * POST /
 * Admin - Create New Post
*/

// const cheerio = require("cheerio");



router.post("/add-post", authMiddleware, async (req, res) => { 
  try {
    let { title, body, textOnly } = req.body;

    console.log("Received Title:", title);
    console.log("Received Body Length:", body.length);

    if (!title || !body.trim()) {
      console.log("Error: Title and body are required");
      return res.status(400).send("Title and body are required");
    }

    // **Load body HTML using Cheerio**
    const $ = cheerio.load(body);

    // **Find all <img> elements**
    let imgElements = $("img").toArray();
    console.log(`Found ${imgElements.length} images in the body`);

    // **Store image upload promises**
    let uploadPromises = imgElements.map(async (img) => {
      let imgSrc = $(img).attr("src");

      if (imgSrc && imgSrc.startsWith("data:image")) {
        try {
          // **Upload image to Cloudinary**
          const uploadedImage = await cloudinary.uploader.upload(imgSrc, {
            folder: "blog_images",
            resource_type: "image",
            quality: "auto:best",
            format: "webp" // Converts to optimized WebP format
          });

          $(img).attr("src", uploadedImage.secure_url); // Replace with Cloudinary URL
        } catch (error) {
          console.error("Image upload failed:", error);
          throw new Error("Image upload failed");
        }
      }
    });

    // **Wait for all images to upload**
    await Promise.all(uploadPromises);

    // Get cleaned-up HTML with Cloudinary URLs
    let updatedBody = $.html();

    // **Save the post (store both HTML and plain text)**
    const newPost = new Post({ title, body: updatedBody, textOnly });
    await newPost.save();

    console.log("Post created successfully!");
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).send("Internal Server Error");
  }
});




/**
 * GET /
 * Admin - Create New Post
*/
router.get('/edit-post/:id', authMiddleware, async (req, res) => {
  try {
    const locals = {
      title: "Edit Post",
      description: "Edit your blog post",
    };

    const data = await Post.findById(req.params.id);
    if (!data) {
      return res.status(404).send("Post not found");
    }

    res.render('admin/edit-post', {
      locals,
      data,
      layout: adminLayout  // Ensure 'adminLayout' exists in your views/layouts folder
    });

  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).send("Internal Server Error");
  }
});


/**
 * PUT /
 * Admin - Create New Post
*/

router.put('/edit-post/:id', authMiddleware, async (req, res) => {
  try {
    console.log("Received request body:", req.body); // Debugging log

    const { title, body } = req.body;

    if (!title || !body.trim()) {
      return res.status(400).send("Title and body are required");
    }

    // Process images and update post (same as before)
    const imageRegex = /<img src="data:image\/(png|jpeg|jpg|gif);base64,([^"]+)"/g;
    let updatedBody = body;
    let match;

    while ((match = imageRegex.exec(body)) !== null) {
      const imageType = match[1];
      const imageData = match[2];

      // Upload image to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(
        `data:image/${imageType};base64,${imageData}`, 
        { folder: "blog_images" }
      );

      // Replace base64 data with Cloudinary URL
      updatedBody = updatedBody.replace(match[0], `<img src="${uploadResponse.secure_url}"`);
    }

    // Update post in database
    const updatedPost = await Post.findByIdAndUpdate(req.params.id, {
      title,
      body: updatedBody, 
      updatedAt: Date.now()
    }, { new: true });

    if (!updatedPost) {
      return res.status(404).send("Post not found");
    }

    res.status(200).json({ message: "Post updated successfully" });
    
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).send("Internal Server Error");
  }
});router.put("/edit-post/:id", authMiddleware, async (req, res) => {
  try {
    console.log("Received request body:", req.body); // Debugging log

    const { title, body } = req.body;

    if (!title || !body.trim()) {
      return res.status(400).send("Title and body are required");
    }

    let updatedBody = body;
    const imageRegex = /<img src="data:image\/(png|jpeg|jpg|gif);base64,([^"]+)"/g;
    let matches = [...body.matchAll(imageRegex)];

    // Upload all images asynchronously to Cloudinary
    const uploadPromises = matches.map(async (match) => {
      const imageType = match[1];
      const imageData = match[2];

      const uploadResponse = await cloudinary.uploader.upload(
        `data:image/${imageType};base64,${imageData}`,
        { folder: "blog_images" }
      );

      // Replace base64 data with Cloudinary URL in content
      updatedBody = updatedBody.replace(match[0], `<img src="${uploadResponse.secure_url}"`);
    });

    await Promise.all(uploadPromises); // Wait for all images to upload

    // Update post in database
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { title, body: updatedBody, updatedAt: Date.now() },
      { new: true }
    );

    if (!updatedPost) {
      return res.status(404).send("Post not found");
    }

    res.status(200).json({ message: "Post updated successfully" });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).send("Internal Server Error");
  }
});





router.post('/admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if(req.body.username === 'admin' && req.body.password === 'password') {
      res.send('You are logged in.')
    } else {
      res.send('Wrong username or password');
    }

  } catch (error) {
    console.log(error);
  }
});

router.get('/register', async (req, res) => {
  try {
    const locals = {
      title: "Admin",
      description: "Simple Blog created with NodeJs, Express & MongoDb."
    }

    res.render('admin/register', { locals, layout: adminLayout });
  } catch (error) {
    console.log(error);
  }
});

/**
 * POST /
 * Admin - Register
*/
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await User.create({ username, password:hashedPassword });
      //res.status(201).json({ message: 'User Created', user });
      res.redirect('/dashboard');
    } catch (error) {
      if(error.code === 11000) {
        res.status(409).json({ message: 'User already in use'});
      }
      res.status(500).json({ message: 'Internal server error'})
    }

  } catch (error) {
    console.log(error);
  }
});





/**
 * DELETE /
 * Admin - Delete Post
*/
router.delete('/delete-post/:id', authMiddleware, async (req, res) => {

  try {
    await Post.deleteOne( { _id: req.params.id } );
    res.redirect('/dashboard');
  } catch (error) {
    console.log(error);
  }

});


/**
 * GET /
 * Admin Logout
*/
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  //res.json({ message: 'Logout successful.'});
  res.redirect('/');
});

router.get('/post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).send("Post not found");
    }
    res.render('post', { data: post }); // Ensure 'data' is being passed
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

    
module.exports = router;
