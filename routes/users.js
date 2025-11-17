import express from 'express';
import User from '../models/User.js';
import VerifierRegistry from '../models/VerifierRegistry.js';
import { protect, restrictTo } from '../middleware/auth.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// All routes protected after this
router.use(protect);

// GET USER PROFILE
router.get('/profile', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// GET ALL USERS (Admin only)
router.get('/', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
});

// CREATE NEW USER (Admin only)
router.post('/', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      password, 
      designation, 
      department, 
      states
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('User already exists with this email', 400));
    }

    // Validate that states with roles and permissions are provided
    if (!states || !Array.isArray(states) || states.length === 0) {
      return next(new AppError('States with roles and permissions are required', 400));
    }

    // Validate each state has required structure
    for (const state of states) {
      if (!state.roles || !Array.isArray(state.roles) || state.roles.length === 0) {
        return next(new AppError('Each state must have at least one role with permissions', 400));
      }

      for (const role of state.roles) {
        if (!role.permissions || !Array.isArray(role.permissions)) {
          return next(new AppError('Each role must have permissions array', 400));
        }

        // Validate each permission has required fields
        for (const permission of role.permissions) {
          if (!permission.resource || !permission.action) {
            return next(new AppError('Each permission must have resource and action', 400));
          }
        }
      }
    }

    // Create new user
    const newUser = await User.create({
      name,
      email,
      phone,
      password,
      designation,
      department,
      isVerified: true // Admin-created users are auto-verified
    });

    // Prepare verifier data with states from request
    const verifierData = {
      userId: newUser._id,
      name,
      email,
      phone,
      designation,
      states: states.map(state => ({
        stateName: state.stateName,
        stateCode: state.stateCode,
        districts: state.districts || [],
        stateConfig: state.stateConfig || {},
        roles: state.roles.map(role => ({
          role: role.role,
          description: role.description || `${role.role} role for ${state.stateName}`,
          permissions: role.permissions.map(perm => ({
            resource: perm.resource,
            action: perm.action,
            grantedAt: new Date(),
            expiresAt: perm.expiresAt,
            status: perm.status || 'active',
            grantedBy: req.user.id,
            conditions: perm.conditions || {}
          })),
          roleStatus: role.roleStatus || 'active',
          isActive: role.isActive !== undefined ? role.isActive : true,
          assignedAt: new Date(),
          assignedBy: req.user.id,
          roleExpiresAt: role.roleExpiresAt
        }))
      }))
    };

    await VerifierRegistry.create(verifierData);

    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      data: {
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          designation: newUser.designation,
          department: newUser.department
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// UPDATE USER PERMISSIONS (Admin only)
router.patch('/:id/permissions', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { states } = req.body;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Validate states structure
    if (!states || !Array.isArray(states)) {
      return next(new AppError('States array is required', 400));
    }

    // Update states with new permissions
    verifier.states = states.map(state => ({
      stateName: state.stateName,
      stateCode: state.stateCode,
      districts: state.districts || [],
      stateConfig: state.stateConfig || {},
      roles: state.roles.map(role => ({
        role: role.role,
        description: role.description || `${role.role} role for ${state.stateName}`,
        permissions: role.permissions.map(perm => ({
          resource: perm.resource,
          action: perm.action,
          grantedAt: new Date(),
          expiresAt: perm.expiresAt,
          status: perm.status || 'active',
          grantedBy: req.user.id,
          conditions: perm.conditions || {}
        })),
        roleStatus: role.roleStatus || 'active',
        isActive: role.isActive !== undefined ? role.isActive : true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        roleExpiresAt: role.roleExpiresAt
      }))
    }));

    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'User permissions updated successfully',
      data: {
        verifier: {
          states: verifier.states
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ADD NEW STATE TO USER (Admin only)
router.post('/:id/states', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { state } = req.body;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Validate state structure
    if (!state || !state.stateCode || !state.roles) {
      return next(new AppError('Valid state with roles is required', 400));
    }

    // Check if state already exists
    const existingState = verifier.states.find(s => s.stateCode === state.stateCode);
    if (existingState) {
      return next(new AppError('State already exists for this user', 400));
    }

    // Add new state
    verifier.states.push({
      stateName: state.stateName,
      stateCode: state.stateCode,
      districts: state.districts || [],
      stateConfig: state.stateConfig || {},
      roles: state.roles.map(role => ({
        role: role.role,
        description: role.description || `${role.role} role for ${state.stateName}`,
        permissions: role.permissions.map(perm => ({
          resource: perm.resource,
          action: perm.action,
          grantedAt: new Date(),
          expiresAt: perm.expiresAt,
          status: perm.status || 'active',
          grantedBy: req.user.id,
          conditions: perm.conditions || {}
        })),
        roleStatus: role.roleStatus || 'active',
        isActive: role.isActive !== undefined ? role.isActive : true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        roleExpiresAt: role.roleExpiresAt
      }))
    });

    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'State added to user successfully',
      data: {
        state: verifier.states.find(s => s.stateCode === state.stateCode)
      }
    });
  } catch (error) {
    next(error);
  }
});

// REMOVE STATE FROM USER (Admin only)
router.delete('/:id/states/:stateCode', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { stateCode } = req.params;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Remove state
    verifier.states = verifier.states.filter(state => state.stateCode !== stateCode);
    
    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'State removed from user successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET AVAILABLE PERMISSIONS OPTIONS (For frontend dropdowns)
router.get('/permissions/options', restrictTo('super_admin', 'state_admin'), (req, res) => {
  const permissionOptions = {
    resources: [
      'user_management',
      'mining_analysis', 
      'compliance_reports',
      'satellite_imagery',
      'volumetric_calculations',
      '3d_visualization',
      'system_analytics',
      'audit_logs',
      'public_portal',
      'mining_leases',
      'reports_approval',
      'data_export',
      'system_config'
    ],
    actions: [
      'create',
      'read', 
      'update',
      'delete',
      'approve',
      'reject',
      'export',
      'manage'
    ],
    statusOptions: [
      'active',
      'inactive',
      'paused',
      'revoked',
      'pending',
      'expired'
    ]
  };

  res.status(200).json({
    status: 'success',
    data: permissionOptions
  });
});

export default router;