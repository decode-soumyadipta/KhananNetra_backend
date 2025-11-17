import express from 'express';
import User from '../models/User.js';
import VerifierRegistry from '../models/VerifierRegistry.js';
import sessionManager from '../middleware/sessionManager.js';
import AppError from '../utils/appError.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// LOGIN
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Please provide email and password!', 400));
    }

    // Find user and check password
    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
    
    if (!user || !(await user.correctPassword(password))) {
      if (user) await user.incrementLoginAttempts();
      return next(new AppError('Incorrect email or password', 401));
    }

    if (user.isLocked) {
      return next(new AppError('Account is temporarily locked. Try again later.', 423));
    }

    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    // Get user permissions with proper population for hierarchical system
    const verifier = await VerifierRegistry.findOne({ userId: user._id })
      .populate({
        path: 'states.roles.permissions.permissionRef',
        model: 'AvailablePermission'
      });

    if (!verifier) {
      return next(new AppError('User permissions not configured', 403));
    }

    // Create session
    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      deviceType: 'web',
      deviceName: 'Web Browser',
      os: req.headers['sec-ch-ua-platform'] || 'Unknown',
      browser: req.headers['sec-ch-ua'] || 'Unknown',
      country: req.headers['cf-ipcountry'] || 'Unknown',
      city: req.headers['cf-ipcity'] || 'Unknown'
    };

    const sessionResult = await sessionManager.createWebSession(res, user, deviceInfo);

    // Prepare user data
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      department: user.department,
      profileImage: user.profileImage,
      isActive: user.isActive,
      isVerified: user.isVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Get user's jurisdictions for frontend
    const jurisdictions = verifier.getJurisdictions();

    // Get all permissions for frontend (flattened for easy access)
    const allPermissions = verifier.getAllPermissions();

    // ✅ ENHANCED: Return hierarchical structure with additional useful data
    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data: {
        user: userData,
        permissions: {
          // Hierarchical structure
          states: verifier.states,
          // Flattened for easy frontend access
          allPermissions: allPermissions.map(p => ({
            resource: p.permission.resource,
            action: p.permission.action,
            module: p.permission.module,
            scope: p.scope,
            role: p.role,
            state: p.state
          })),
          // Quick access flags
          accessLevel: {
            isSuperAdmin: jurisdictions.national,
            globalVerificationLevel: verifier.globalVerificationLevel,
            accessTier: verifier.accessTier,
            departments: [verifier.department]
          },
          // Jurisdictions for location-based access
          jurisdictions: jurisdictions
        },
        session: {
          sessionId: sessionResult.sessionId,
          riskScore: sessionResult.riskScore,
          requiresReauth: sessionResult.requiresReauth
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
});

// LOGOUT
router.post('/logout',  async (req, res, next) => {
  try {
    if (req.session && req.session.sessionId) {
      await sessionManager.revokeSession(req.user.id, req.session.sessionId, res);
    } else {
      // Fallback: just clear cookies if no session info
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear cookies even if there's an error
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    next(error);
  }
});

// REFRESH TOKEN
router.post('/refresh-token', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      return next(new AppError('Refresh token is required', 401));
    }

    const refreshResult = await sessionManager.refreshAccessToken(refreshToken, res);

    res.status(200).json({
      status: 'success',
      message: 'Token refreshed successfully',
      data: {
        sessionId: refreshResult.sessionId
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    // Clear cookies if refresh fails
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    return next(new AppError('Invalid refresh token', 401));
  }
});

// GET CURRENT USER (Protected)
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const verifier = await VerifierRegistry.findOne({ userId: req.user.id })
      .populate({
        path: 'states.roles.permissions.permissionRef',
        model: 'AvailablePermission'
      });

    if (!user || !verifier) {
      return next(new AppError('User not found', 404));
    }

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      department: user.department,
      profileImage: user.profileImage,
      isActive: user.isActive,
      isVerified: user.isVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Get user's jurisdictions for frontend
    const jurisdictions = verifier.getJurisdictions();

    // Get all permissions for frontend (flattened for easy access)
    const allPermissions = verifier.getAllPermissions();

    // ✅ ENHANCED: Return hierarchical structure with additional useful data
    res.status(200).json({
      status: 'success',
      data: {
        user: userData,
        permissions: {
          // Hierarchical structure
          states: verifier.states,
          // Flattened for easy frontend access
          allPermissions: allPermissions.map(p => ({
            resource: p.permission.resource,
            action: p.permission.action,
            module: p.permission.module,
            scope: p.scope,
            role: p.role,
            state: p.state
          })),
          // Quick access flags
          accessLevel: {
            isSuperAdmin: jurisdictions.national,
            globalVerificationLevel: verifier.globalVerificationLevel,
            accessTier: verifier.accessTier,
            departments: [verifier.department]
          },
          // Jurisdictions for location-based access
          jurisdictions: jurisdictions
        },
        session: {
          sessionId: req.session?.sessionId,
          riskScore: req.session?.riskScore,
          requiresReauth: req.session?.flags?.requiresReauth
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    next(error);
  }
});

// GET USER PERMISSIONS (Protected - for frontend permission checking)
router.get('/permissions', protect, async (req, res, next) => {
  try {
    const verifier = await VerifierRegistry.findOne({ userId: req.user.id })
      .populate({
        path: 'states.roles.permissions.permissionRef',
        model: 'AvailablePermission'
      });

    if (!verifier) {
      return next(new AppError('User permissions not configured', 404));
    }

    // Get all permissions in a frontend-friendly format
    const allPermissions = verifier.getAllPermissions();
    const jurisdictions = verifier.getJurisdictions();

    res.status(200).json({
      status: 'success',
      data: {
        permissions: allPermissions.map(p => ({
          resource: p.permission.resource,
          action: p.permission.action,
          module: p.permission.module,
          category: p.permission.category,
          scope: p.scope,
          role: p.role,
          state: p.state,
          description: p.permission.description
        })),
        accessLevel: {
          isSuperAdmin: jurisdictions.national,
          globalVerificationLevel: verifier.globalVerificationLevel,
          accessTier: verifier.accessTier
        },
        jurisdictions: jurisdictions,
        modules: [...new Set(allPermissions.map(p => p.permission.module))] // Unique modules
      }
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    next(error);
  }
});

// CHECK PERMISSION (Protected - for dynamic permission checking)
router.post('/check-permission', protect, async (req, res, next) => {
  try {
    const { resource, action, stateCode, districtCode, module } = req.body;

    if (!resource || !action) {
      return next(new AppError('Resource and action are required', 400));
    }

    const permissionCheck = await VerifierRegistry.checkPermission(
      req.user.id,
      resource,
      action,
      stateCode,
      districtCode,
      { module }
    );

    res.status(200).json({
      status: 'success',
      data: {
        hasPermission: permissionCheck.hasPermission,
        details: permissionCheck
      }
    });
  } catch (error) {
    console.error('Check permission error:', error);
    next(error);
  }
});

// UPDATE PASSWORD (Protected)
router.patch('/update-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new AppError('Please provide current and new password', 400));
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.correctPassword(currentPassword))) {
      return next(new AppError('Your current password is wrong.', 401));
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = Date.now() - 1000;
    await user.save();

    // Create new session for security
    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      deviceType: 'web',
      deviceName: 'Web Browser',
      os: req.headers['sec-ch-ua-platform'] || 'Unknown',
      browser: req.headers['sec-ch-ua'] || 'Unknown',
      country: req.headers['cf-ipcountry'] || 'Unknown',
      city: req.headers['cf-ipcity'] || 'Unknown'
    };

    const sessionResult = await sessionManager.createWebSession(res, user, deviceInfo);

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        },
        session: {
          sessionId: sessionResult.sessionId,
          requiresReauth: sessionResult.requiresReauth
        }
      }
    });
  } catch (error) {
    console.error('Update password error:', error);
    next(error);
  }
});

// GET ACTIVE SESSIONS (Protected)
router.get('/sessions', protect, async (req, res, next) => {
  try {
    const activeSessions = await sessionManager.getActiveSessions(req.user.id);
    
    res.status(200).json({
      status: 'success',
      data: {
        sessions: activeSessions
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    next(error);
  }
});

// REVOKE SESSION (Protected)
router.post('/sessions/:sessionId/revoke', protect, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    await sessionManager.revokeSession(req.user.id, sessionId, res);
    
    res.status(200).json({
      status: 'success',
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    next(error);
  }
});

// CHECK MODULE ACCESS (Protected)
router.get('/module-access/:module', protect, async (req, res, next) => {
  try {
    const { module } = req.params;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.user.id })
      .populate({
        path: 'states.roles.permissions.permissionRef',
        model: 'AvailablePermission'
      });

    if (!verifier) {
      return next(new AppError('User permissions not configured', 404));
    }

    const hasModuleAccess = verifier.hasModuleAccess(module);

    res.status(200).json({
      status: 'success',
      data: {
        module,
        hasAccess: hasModuleAccess,
        permissions: verifier.getAllPermissions()
          .filter(p => p.permission.module === module)
          .map(p => ({
            resource: p.permission.resource,
            action: p.permission.action,
            scope: p.scope
          }))
      }
    });
  } catch (error) {
    console.error('Check module access error:', error);
    next(error);
  }
});

export default router;