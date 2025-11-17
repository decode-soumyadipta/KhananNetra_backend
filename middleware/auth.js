import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import VerifierRegistry from '../models/VerifierRegistry.js';
import sessionManager from './sessionManager.js';
import AppError from '../utils/appError.js';

export const protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'access') {
      return next(new AppError('Invalid token type', 401));
    }

    const sessionValidation = await sessionManager.validateWebSession(
      token, 
      req.ip, 
      req.headers['user-agent']
    );

    if (!sessionValidation) {
      return next(new AppError('Invalid session! Please log in again.', 401));
    }

    const { userId, session, user } = sessionValidation;

    // Check if user still exists and is active
    if (!user || !user.isActive) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // Check if user changed password after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }

    // Get user permissions from VerifierRegistry with proper population
    const verifier = await VerifierRegistry.findOne({ userId })
      .populate({
        path: 'states.roles.permissions.permissionRef',
        model: 'AvailablePermission'
      });

    if (!verifier) {
      return next(new AppError('User permissions not configured!', 403));
    }

    // Check if session requires reauthentication
    if (session.flags.requiresReauth) {
      return next(new AppError('Reauthentication required for security reasons.', 401));
    }

    // Attach user and permissions to request
    req.user = user;
    req.verifier = verifier;
    req.session = session;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token! Please log in again.', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired! Please log in again.', 401));
    }
    
    return next(new AppError('Authentication failed! Please log in again.', 401));
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.verifier) {
      return next(new AppError('User permissions not available', 403));
    }

    // Extract roles from nested states structure
    const userRoles = req.verifier.states.flatMap(state => 
      state.roles
        .filter(role => role.roleStatus === 'active' && role.isActive)
        .map(role => role.role)
    );

    if (!roles.some(role => userRoles.includes(role))) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    next();
  };
};

// Enhanced permission middleware with hierarchical support
export const requirePermission = (resource, action, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.verifier) {
        return next(new AppError('User permissions not available', 403));
      }

      // ✅ FIXED: Check for super admin first - super admin has all permissions
      const isSuperAdmin = req.verifier.states.some(state =>
        state.roles.some(role => 
          role.role === "system_super_admin" && 
          role.isActive && 
          role.roleStatus === "active"
        )
      );

      if (isSuperAdmin) {
        // Super admin bypasses all permission checks
        req.permissionContext = { 
          hasPermission: true, 
          role: "system_super_admin",
          isSuperAdmin: true 
        };
        return next();
      }

      // Extract state and district codes from request with safe access
      const stateCode = req.body?.stateCode || req.query?.stateCode || req.params?.stateCode;
      const districtCode = req.body?.districtCode || req.query?.districtCode || req.params?.districtCode;

      // Check permission using VerifierRegistry static method
      const permissionCheck = await VerifierRegistry.checkPermission(
        req.user.id,
        resource,
        action,
        stateCode,
        districtCode,
        options
      );

      if (!permissionCheck.hasPermission) {
        return next(new AppError(`Access denied: ${permissionCheck.reason}`, 403));
      }

      // Attach permission context to request
      req.permissionContext = permissionCheck;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return next(new AppError('Permission verification failed', 500));
    }
  };
};

// Module-based access middleware
export const requireModuleAccess = (module) => {
  return async (req, res, next) => {
    try {
      if (!req.verifier) {
        return next(new AppError('User permissions not available', 403));
      }

      // ✅ FIXED: Super admin has access to all modules
      const isSuperAdmin = req.verifier.states.some(state =>
        state.roles.some(role => 
          role.role === "system_super_admin" && 
          role.isActive && 
          role.roleStatus === "active"
        )
      );

      if (isSuperAdmin) {
        return next();
      }

      const hasModuleAccess = req.verifier.hasModuleAccess(module);

      if (!hasModuleAccess) {
        return next(new AppError(`Access denied for module: ${module}`, 403));
      }

      next();
    } catch (error) {
      console.error('Module access check error:', error);
      return next(new AppError('Module access verification failed', 500));
    }
  };
};

// State access middleware
export const restrictToState = (stateCode) => {
  return (req, res, next) => {
    if (!req.verifier) {
      return next(new AppError('User permissions not available', 403));
    }

    // ✅ FIXED: Super admin has access to all states
    const isSuperAdmin = req.verifier.states.some(state =>
      state.roles.some(role => 
        role.role === "system_super_admin" && 
        role.isActive && 
        role.roleStatus === "active"
      )
    );

    if (isSuperAdmin) {
      return next();
    }

    const hasStateAccess = req.verifier.canAccessLocation(stateCode);

    if (!hasStateAccess) {
      return next(new AppError(`Access denied for state: ${stateCode}`, 403));
    }

    req.stateCode = stateCode;
    next();
  };
};

// District access middleware
export const restrictToDistrict = (stateCode, districtCode) => {
  return (req, res, next) => {
    if (!req.verifier) {
      return next(new AppError('User permissions not available', 403));
    }

    // ✅ FIXED: Super admin has access to all districts
    const isSuperAdmin = req.verifier.states.some(state =>
      state.roles.some(role => 
        role.role === "system_super_admin" && 
        role.isActive && 
        role.roleStatus === "active"
      )
    );

    if (isSuperAdmin) {
      return next();
    }

    const hasDistrictAccess = req.verifier.canAccessLocation(stateCode, districtCode);

    if (!hasDistrictAccess) {
      return next(new AppError(`Access denied for district: ${districtCode} in state: ${stateCode}`, 403));
    }

    req.stateCode = stateCode;
    req.districtCode = districtCode;
    next();
  };
};

// Super admin bypass middleware
export const superAdminOnly = () => {
  return (req, res, next) => {
    if (!req.verifier) {
      return next(new AppError('User permissions not available', 403));
    }

    const isSuperAdmin = req.verifier.states.some(state =>
      state.roles.some(role => 
        role.role === "system_super_admin" && 
        role.isActive && 
        role.roleStatus === "active"
      )
    );

    if (!isSuperAdmin) {
      return next(new AppError('Super admin access required', 403));
    }

    next();
  };
};

// Enhanced permission check with custom options
export const requirePermissionWithOptions = (resource, action, options = {}) => {
  return requirePermission(resource, action, options);
};

// Session cleanup middleware
export const sessionCleanup = async (req, res, next) => {
  try {
    // Optional: Run session cleanup periodically
    // await sessionManager.cleanupExpiredSessions();
    next();
  } catch (error) {
    console.error('Session cleanup error:', error);
    next(); // Don't block request if cleanup fails
  }
};

export default {
  protect,
  restrictTo,
  requirePermission,
  requireModuleAccess,
  restrictToState,
  restrictToDistrict,
  superAdminOnly,
  requirePermissionWithOptions,
  sessionCleanup
};