const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const session = require('express-session');
const User = require("./config");
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const csrf = require('csurf');
const csrfProtection = csrf();

const app = express();

// Session middleware (only once, at the top)
app.use(session({
  store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/NutriTrack' }),
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Other middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use(flash());


// Routes
app.get('/', (req, res) => {
  // Clear any existing session when showing login page
  req.session.destroy();
  res.render('login', { showLogout: false });
});

app.get('/success', (req, res) => {
  res.render('success');
});

app.get('/signup', (req, res) => {
  res.render('signup', { showLogout: false });
});

app.get('/home', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    res.render('home', { user: user });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading home page");
  }
});

app.post("/signup", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    
    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
      age: req.body.age,
      gender: req.body.gender,
      height: req.body.height,
      weight: req.body.weight,
      neck: req.body.neck,
      waist: req.body.waist,
      hip: req.body.hip,
      profession: req.body.profession,
      activity: req.body.activity,
      medical: req.body.medical,
      termsAccepted: req.body.terms === 'on'
    });
    
    newUser.bmi = newUser.calculateBMI();
    newUser.bmr = newUser.calculateBMR();
    newUser.bodyFatPercentage = newUser.calculateBodyFat();
    newUser.lastCalculated = new Date();
    
    await newUser.save();
    res.redirect('/success');
  } catch (error) {
    console.error(error);
    res.status(500).render('signup', { error: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 1. Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).render('login', { 
        error: "Invalid email or password",
        email: email // Preserve the entered email
      });
    }

    // 2. Compare passwords
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).render('login', { 
        error: "Invalid email or password",
        email: email // Preserve the entered email
      });
    }

    // 3. Set session and redirect to home
    req.session.userId = user._id;
    res.redirect('/home');
    
  } catch (error) {
    console.error(error);
    res.status(500).render('login', { 
      error: "An error occurred during login",
      email: req.body.email 
    });
  }
});
app.use(csrfProtection);

app.use(csrfProtection);

app.get('/calculate', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Always calculate fresh metrics when loading the page
    user.bmi = user.calculateBMI();
    user.bmr = user.calculateBMR();
    user.bodyFatPercentage = user.calculateBodyFat();
    user.lastCalculated = new Date();
    
    res.render('calculate', { 
      user: user,
      bmiCategory: getBMICategory(user.bmi),
      csrfToken: req.csrfToken() // Add CSRF token
    });
  } catch (error) {
    console.error("Detailed error:", error);
    res.status(500).render('error', { 
      message: "Error calculating metrics",
      error: error.message 
    });
  }
});

// Add this new route for updating metrics
app.post('/update-metrics', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Get all measurements from form
    const newWeight = parseFloat(req.body.weight);
    const newNeck = req.body.neck ? parseFloat(req.body.neck) : user.neck;
    const newWaist = req.body.waist ? parseFloat(req.body.waist) : user.waist;
    const newHip = req.body.hip ? parseFloat(req.body.hip) : user.hip;
    
    // Add current metrics to history before updating
    user.weightHistory.push({
      weight: user.weight,
      neck: user.neck,
      waist: user.waist,
      hip: user.hip,
      bmi: user.bmi,
      bmr: user.bmr,
      bodyFatPercentage: user.bodyFatPercentage,
      date: new Date()
    });

    // Update all measurements
    user.weight = newWeight;
    user.neck = newNeck;
    user.waist = newWaist;
    if (user.gender === 'female') {
      user.hip = newHip;
    }

    // Recalculate all metrics
    user.bmi = user.calculateBMI();
    user.bmr = user.calculateBMR();
    user.bodyFatPercentage = user.calculateBodyFat();
    user.lastCalculated = new Date();

    await user.save();
    
    res.redirect('/calculate');
  } catch (error) {
    console.error("Update metrics error:", error);
    res.status(500).render('error', {
      message: "Error updating metrics",
      error: error.message
    });
  }
});







// Add this route to handle POST /logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/home');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
  });
  function getBMICategory(bmi) {
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Normal weight";
    if (bmi < 30) return "Overweight";
    return "Obese";
  }











  
  const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
