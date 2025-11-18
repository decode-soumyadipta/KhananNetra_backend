import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const UserSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"]
  },
  phone: {
    type: String,
    required: [true, "Phone number is required"],
    trim: true
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: 6,
    select: false
  },
  
  // Profile Information
  designation: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  profileImage: {
    type: String,
    default: ""
  },
  
  // Status & Verification
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  
  // Security & Session Management
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Session Management
  loginSessions: [{
    sessionId: {
      type: String,
      required: true
      // Removed unique: true - causes issues with empty arrays and MongoDB indexing
    },
    refreshToken: {
      type: String,
      required: true
    },
    deviceFingerprint: String,
    deviceId: String,
    deviceType: String,
    deviceName: String,
    os: String,
    browser: String,
    userAgent: String,
    screenResolution: String,
    language: String,
    ip: String,
    country: String,
    city: String,
    region: String,
    timezone: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
      accuracy: Number
    },
    isp: String,
    proxy: Boolean,
    vpn: Boolean,
    authType: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isTrusted: {
      type: Boolean,
      default: false
    },
    mfaVerified: {
      type: Boolean,
      default: false
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    pushTokens: {
      expo: String,
      fcm: String,
      lastRegistered: Date,
      isActive: Boolean
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date,
    autoLogoutAt: Date,
    flags: {
      requiresReauth: {
        type: Boolean,
        default: false
      },
      suspiciousActivity: {
        type: Boolean,
        default: false
      },
      unusualLocation: {
        type: Boolean,
        default: false
      },
      compromised: {
        type: Boolean,
        default: false
      },
      highRiskOperation: {
        type: Boolean,
        default: false
      }
    }
  }],
  
  // Security Patterns for Risk Assessment
  securityPatterns: {
    commonCountries: [{
      country: String,
      loginCount: {
        type: Number,
        default: 1
      },
      lastSeen: Date
    }],
    commonCities: [{
      city: String,
      country: String,
      loginCount: {
        type: Number,
        default: 1
      },
      lastSeen: Date
    }],
    knownDevices: [{
      deviceFingerprint: String,
      deviceId: String,
      deviceName: String,
      deviceType: String,
      os: String,
      browser: String,
      firstSeen: Date,
      lastSeen: Date,
      totalLogins: {
        type: Number,
        default: 1
      },
      isTrusted: {
        type: Boolean,
        default: false
      },
      trustLevel: {
        type: String,
        enum: ['low', 'medium', 'high', 'verified'],
        default: 'medium'
      },
      autoTrusted: {
        type: Boolean,
        default: false
      }
    }],
    loginTimePatterns: {
      usualHours: {
        startHour: {
          type: Number,
          min: 0,
          max: 23,
          default: 6
        },
        endHour: {
          type: Number,
          min: 0,
          max: 23,
          default: 22
        }
      },
      commonDays: [String],
      timezone: String
    },
    authTypePreferences: {
      web: {
        type: Number,
        default: 0
      },
      mobile: {
        type: Number,
        default: 0
      },
      api: {
        type: Number,
        default: 0
      }
    },
    lastUpdated: Date
  },
  
  // Account Freeze for Security
  accountFreeze: {
    isFrozen: {
      type: Boolean,
      default: false
    },
    frozenAt: Date,
    frozenUntil: Date,
    reason: String,
    unfrozenAt: Date
  },
  
  // Last Login Info
  lastLoginAt: Date,
  lastLoginIP: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ isActive: 1 });
// Removed: UserSchema.index({ 'loginSessions.sessionId': 1 }); - Caused duplicate key errors with null values
UserSchema.index({ 'loginSessions.expiresAt': 1 });

// Middleware
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

UserSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for account lock status
UserSchema.virtual("isLocked").get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Cleanup old sessions method
UserSchema.methods.cleanupOldSessions = function() {
  const maxSessions = 10; // Keep only 10 most recent sessions
  if (this.loginSessions.length > maxSessions) {
    this.loginSessions = this.loginSessions
      .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
      .slice(0, maxSessions);
  }
};

// Instance Methods
UserSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString("hex");
  
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

UserSchema.methods.incrementLoginAttempts = async function() {
  // If lock has expired, reset attempts
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts += 1;
  }
  
  // Lock the account if max attempts reached
  if (this.loginAttempts >= 5 && !this.isLocked) {
    this.lockUntil = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
  }
  
  return this.save();
};

export default mongoose.model("User", UserSchema);