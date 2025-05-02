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
    res.render('success', {
    showLogout: true,
    csrfToken: req.csrfToken()
  });
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

// Grocery List Routes
app.get('/grocery-list', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }

    // If user doesn't have any grocery list, create one
    if (!user.groceryLists || user.groceryLists.length === 0) {
      user.groceryLists = [{
        name: "My Grocery List",
        items: []
      }];
      await user.save();
    }

    res.render('grocery-list', {
      user: user,
      activeList: user.groceryLists[0],
      csrfToken: req.csrfToken() // Add the csrfToken here
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', {
      message: "Error loading grocery list",
      error: error.message
    });
  }
});

// Add item to grocery list
app.post('/grocery-list/add', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const { itemName, quantity } = req.body;
    
    if (!itemName) {
      return res.status(400).json({ error: "Item name is required" });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Ensure user has at least one grocery list
    if (!user.groceryLists || user.groceryLists.length === 0) {
      user.groceryLists = [{
        name: "My Grocery List",
        items: []
      }];
    }
    
    // Add item to first list (can be expanded to handle multiple lists)
    user.groceryLists[0].items.push({
      name: itemName,
      quantity: quantity || "1",
      status: 'pending'
    });
    
    await user.save();
    res.redirect('/grocery-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error adding item to grocery list" });
  }
});

// Update item status
app.post('/grocery-list/update-status/:itemId', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const { itemId } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'bought', 'not-found'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Find the item in the first list and update its status
    const list = user.groceryLists[0];
    const item = list.items.id(itemId);
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    item.status = status;
    await user.save();
    
    res.redirect('/grocery-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error updating item status" });
  }
});

// Update item details
app.post('/grocery-list/update/:itemId', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const { itemId } = req.params;
    const { itemName, quantity } = req.body;
    
    if (!itemName) {
      return res.status(400).json({ error: "Item name is required" });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Find and update the item
    const list = user.groceryLists[0];
    const item = list.items.id(itemId);
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    item.name = itemName;
    item.quantity = quantity || item.quantity;
    
    await user.save();
    res.redirect('/grocery-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error updating item" });
  }
});

// Delete item
app.post('/grocery-list/delete/:itemId', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const { itemId } = req.params;
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Find and remove the item
    const list = user.groceryLists[0];
    list.items = list.items.filter(item => item._id.toString() !== itemId);
    
    await user.save();
    res.redirect('/grocery-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error deleting item" });
  }
});

// Clear entire grocery list
app.post('/grocery-list/clear', csrfProtection, async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Clear all items from the first list
    if (user.groceryLists && user.groceryLists.length > 0) {
      user.groceryLists[0].items = [];
    }
    
    await user.save();
    res.redirect('/grocery-list');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error clearing grocery list" });
    // Meal Plans Routes

// View meal plans
app.get('/meal-plans', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        res.render('meal-plans', {
            user: user,
            mealPlans: user.mealPlans || [],
            csrfToken: req.csrfToken(),
            showLogout: true
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', {
            message: "Error loading meal plans",
            error: error.message,
            showLogout: true,
            csrfToken: req.csrfToken()
        });
    }
});

// Add new meal
app.post('/meal-plans/add-meal', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, name, type, calories } = req.body;
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        if (!mealPlan) {
            return res.status(404).json({ error: "Meal plan not found" });
        }

        mealPlan.meals.push({
            name,
            type,
            calories: Number(calories),
            recipes: []
        });

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error adding meal" });
    }
});

// Edit meal
app.post('/meal-plans/edit-meal/:planId/:mealId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, mealId } = req.params;
        const { name, type, calories } = req.body;
        
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        const meal = mealPlan.meals.id(mealId);
        
        if (!meal) {
            return res.status(404).json({ error: "Meal not found" });
        }

        meal.name = name;
        meal.type = type;
        meal.calories = Number(calories);
        meal.updatedAt = new Date();

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error updating meal" });
    }
});

// Delete meal
app.post('/meal-plans/delete-meal/:planId/:mealId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, mealId } = req.params;
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        mealPlan.meals = mealPlan.meals.filter(meal => meal._id.toString() !== mealId);

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error deleting meal" });
    }
});

  }
  // Add recipe to meal
app.post('/meal-plans/add-recipe/:planId/:mealId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, mealId } = req.params;
        const { name, ingredients, instructions, preparationTime, servings } = req.body;
        
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        const meal = mealPlan.meals.id(mealId);
        
        if (!meal) {
            return res.status(404).json({ error: "Meal not found" });
        }

        // Process ingredients array
        let processedIngredients = [];
        if (Array.isArray(ingredients)) {
            processedIngredients = ingredients.map(ing => ({
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit
            }));
        }

        // Add the recipe
        meal.recipes.push({
            name,
            ingredients: processedIngredients,
            instructions: instructions.split('\n').filter(i => i.trim()),
            preparationTime: Number(preparationTime),
            servings: Number(servings)
        });

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error('Error adding recipe:', error);
        res.status(500).render('error', {
            message: "Error adding recipe",
            error: error.message,
            showLogout: true,
            csrfToken: req.csrfToken()
        });
    }
});

// Edit recipe
app.post('/meal-plans/edit-recipe/:planId/:mealId/:recipeId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, mealId, recipeId } = req.params;
        const { name, ingredients, instructions, preparationTime, servings } = req.body;
        
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        const meal = mealPlan.meals.id(mealId);
        const recipe = meal.recipes.id(recipeId);
        
        if (!recipe) {
            return res.status(404).json({ error: "Recipe not found" });
        }

        // Process ingredients array
        let processedIngredients = [];
        if (Array.isArray(ingredients)) {
            processedIngredients = ingredients.map(ing => ({
                name: ing.name || '',
                quantity: ing.quantity || '',
                unit: ing.unit || ''
            })).filter(ing => ing.name.trim() !== ''); // Remove empty ingredients
        }

        // Update recipe
        recipe.name = name;
        recipe.ingredients = processedIngredients;
        recipe.instructions = instructions.split('\n').filter(i => i.trim());
        recipe.preparationTime = Number(preparationTime);
        recipe.servings = Number(servings);

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error('Error updating recipe:', error);
        res.status(500).render('error', {
            message: "Error updating recipe",
            error: error.message,
            showLogout: true,
            csrfToken: req.csrfToken()
        });
    }
});

// Delete recipe
app.post('/meal-plans/delete-recipe/:planId/:mealId/:recipeId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId, mealId, recipeId } = req.params;
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        const meal = mealPlan.meals.id(mealId);
        
        if (!meal) {
            return res.status(404).json({ error: "Meal not found" });
        }

        // Remove the recipe
        meal.recipes = meal.recipes.filter(recipe => recipe._id.toString() !== recipeId);

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error('Error deleting recipe:', error);
        res.status(500).render('error', {
            message: "Error deleting recipe",
            error: error.message,
            showLogout: true,
            csrfToken: req.csrfToken()
        });
    }
});

// Add new meal plan
app.post('/meal-plans/add', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: "Meal plan name is required" });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        // Initialize mealPlans array if it doesn't exist
        if (!user.mealPlans) {
            user.mealPlans = [];
        }

        // Add new meal plan
        user.mealPlans.push({
            name,
            description,
            meals: []
        });

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', {
            message: "Error creating meal plan",
            error: error.message,
            showLogout: true,
            csrfToken: req.csrfToken()
        });
    }
});

// Add route to delete meal plan
app.post('/meal-plans/delete/:planId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId } = req.params;
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.redirect('/login');
        }

        // Filter out the meal plan to delete
        user.mealPlans = user.mealPlans.filter(plan => plan._id.toString() !== planId);

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error deleting meal plan" });
    }
});

// Add route to edit meal plan
app.post('/meal-plans/edit/:planId', csrfProtection, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const { planId } = req.params;
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: "Meal plan name is required" });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        const mealPlan = user.mealPlans.id(planId);
        if (!mealPlan) {
            return res.status(404).json({ error: "Meal plan not found" });
        }

        mealPlan.name = name;
        mealPlan.description = description;
        mealPlan.updatedAt = new Date();

        await user.save();
        res.redirect('/meal-plans');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error updating meal plan" });
    }
});
});









  
  const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
