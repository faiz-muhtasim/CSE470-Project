const mongoose = require("mongoose");

// Connect to MongoDB
const connect = mongoose.connect("mongodb://localhost:27017/NutriTrack");

connect.then(() => {
    console.log("Database connected Successfully");
})
.catch(() => {
    console.log("Database can not be connected");
});

// Updated User Schema with all fields
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    gender: {
        type: String,
        required: true,
        enum: ['male', 'female', 'other', 'prefer-not-to-say']
    },
    height: {
        type: Number,
        required: true
    },
    weight: {
        type: Number,
        required: true
    },
    neck: Number,
    waist: Number,
    hip: Number,
    profession: String,
    activity: {
        type: String,
        enum: ['sedentary', 'light', 'moderate', 'active', 'extreme']
    },
    medical: String,
    termsAccepted: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    bmi: {
        type: Number,
        default: null
    },
    bmr: {
        type: Number,
        default: null
    },
    bodyFatPercentage: {
        type: Number,
        default: null
    },
    lastCalculated: {
        type: Date,
        default: null
    },
    weightHistory: [{
        weight: Number,
        date: { type: Date, default: Date.now },
        bmi: Number,
        bmr: Number,
        bodyFatPercentage: Number
    }],
    
    groceryLists: [{
        name: {
            type: String,
            default: "My Grocery List"
        },
        items: [{
            name: String,
            status: {
                type: String,
                enum: ['pending', 'bought', 'not-found'],
                default: 'pending'
            },
            quantity: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
});
// Calculation methods
UserSchema.methods.calculateBMI = function() {
    // BMI = weight(kg) / (height(m))^2
    return this.weight / Math.pow(this.height / 100, 2);
};

UserSchema.methods.calculateBMR = function() {
    // Mifflin-St Jeor Equation
    if (this.gender === 'male') {
        return 10 * this.weight + 6.25 * this.height - 5 * this.age + 5;
    } else { // female or other
        return 10 * this.weight + 6.25 * this.height - 5 * this.age - 161;
    }
};

UserSchema.methods.calculateBodyFat = function() {
    // Navy Body Fat Formula
    if (!this.neck || !this.waist || (this.gender === 'female' && !this.hip)) {
        return null;
    }
    
    if (this.gender === 'male') {
        return 495 / (1.0324 - 0.19077 * Math.log10(this.waist - this.neck) + 
               0.15456 * Math.log10(this.height)) - 450;
    } else {
        return 495 / (1.29579 - 0.35004 * Math.log10(this.waist + this.hip - this.neck) + 
               0.22100 * Math.log10(this.height)) - 450;
    }
};
const User = mongoose.model("User", UserSchema);

module.exports = User;
