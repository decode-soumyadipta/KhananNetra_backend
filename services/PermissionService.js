// services/PermissionService.js
import mongoose from 'mongoose';
import VerifierRegistry from '../models/VerifierRegistry.js';
import VerifierAuditLog from '../models/VerifierAuditLog.js';

class PermissionService {
  
  /**
   * 🔹 Check if user has permission with hierarchical validation
   */
  static async checkPermission(userId, resource, action, options = {}) {
    const {
      stateCode = null,
      districtCode = null,
      checkExpiry = true,
      checkActiveStatus = true,
      auditAction = true,
      session = null
    } = options;

    const auditData = {
      actor: { userId },
      action: {
        type: 'access_attempt',
        resource,
        operation: action,
        description: `Permission check for ${resource}.${action}`
      },
      target: { resourceId: null, resourceType: resource },
      result: { status: 'pending' },
      security: { riskLevel: 'low' }
    };

    try {
      const verifier = await VerifierRegistry.findOne({ userId })
        .populate('userId', 'isActive emailVerified')
        .session(session);

      // Basic validation
      if (!verifier) {
        await this.logAudit({
          ...auditData,
          result: { 
            status: 'failure', 
            errorCode: 'USER_NOT_FOUND',
            errorMessage: 'User not found in verifier registry'
          }
        }, userId);
        return { hasPermission: false, code: 'USER_NOT_FOUND' };
      }

      if (checkActiveStatus && (!verifier.userId.isActive || verifier.status !== 'active')) {
        await this.logAudit({
          ...auditData,
          result: { 
            status: 'failure', 
            errorCode: 'ACCOUNT_INACTIVE',
            errorMessage: 'User account is not active'
          }
        }, userId);
        return { hasPermission: false, code: 'ACCOUNT_INACTIVE' };
      }

      // Check permissions across all states and roles
      for (const state of verifier.states) {
        if (stateCode && state.stateCode !== stateCode) continue;
        if (checkActiveStatus && !state.isActive) continue;

        for (const role of state.roles) {
          if (checkActiveStatus && (role.roleStatus !== 'active' || !role.isActive)) continue;

          for (const permission of role.permissions) {
            if (checkActiveStatus && permission.status !== 'active') continue;
            if (checkExpiry && permission.expiresAt && permission.expiresAt < new Date()) continue;

            if (permission.resource === resource && permission.action === action) {
              // District-level access check
              if (districtCode) {
                const hasDistrictAccess = state.districts.some(
                  district => district.districtCode === districtCode && district.isActive
                );
                if (!hasDistrictAccess) {
                  await this.logAudit({
                    ...auditData,
                    result: { 
                      status: 'failure', 
                      errorCode: 'DISTRICT_ACCESS_DENIED',
                      errorMessage: 'District access denied'
                    }
                  }, userId);
                  return { hasPermission: false, code: 'DISTRICT_ACCESS_DENIED' };
                }
              }

              // Permission granted - log success
              const result = {
                hasPermission: true,
                role: role.role,
                roleLevel: role.level,
                state: state.stateName,
                stateCode: state.stateCode,
                permission,
                userLevel: verifier.globalVerificationLevel
              };

              if (auditAction) {
                await this.logAudit({
                  ...auditData,
                  result: { 
                    status: 'success',
                    affectedRecords: 1
                  }
                }, userId);
              }

              return result;
            }
          }
        }
      }

      // No permission found
      await this.logAudit({
        ...auditData,
        result: { 
          status: 'failure', 
          errorCode: 'PERMISSION_DENIED',
          errorMessage: 'No matching permission found'
        }
      }, userId);

      return { hasPermission: false, code: 'PERMISSION_DENIED' };

    } catch (error) {
      console.error('Permission check error:', error);
      
      await this.logAudit({
        ...auditData,
        result: { 
          status: 'failure', 
          errorCode: 'SYSTEM_ERROR',
          errorMessage: error.message
        }
      }, userId);

      return { hasPermission: false, code: 'SYSTEM_ERROR' };
    }
  }

  /**
   * 🔹 Hierarchical Role Assignment with Audit
   */
  static async assignRole(assignerId, assignmentData, session = null) {
    const {
      targetUserId,
      role,
      stateCode,
      districtCode,
      reason,
      expiresAt,
      permissions = []
    } = assignmentData;

    const shouldEndSession = !session;
    if (!session) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      // Get assigner's details and validate hierarchy
      const assignerRegistry = await VerifierRegistry.findOne({ userId: assignerId })
        .populate('userId', 'name email')
        .session(session);

      if (!assignerRegistry) {
        throw new Error('Assigner not found in registry');
      }

      const assignerMaxLevel = Math.max(...assignerRegistry.states.flatMap(state => 
        state.roles.map(r => r.level)
      ));

      // Validate hierarchy
      const hierarchyCheck = await this.validateHierarchy(assignerMaxLevel, role, stateCode, districtCode, assignerRegistry);
      if (!hierarchyCheck.valid) {
        await this.logAudit({
          actor: await this.getAuditActor(assignerRegistry, assignerId),
          action: {
            type: 'role_assignment',
            resource: 'role_management',
            operation: 'create',
            description: `Attempted role assignment beyond authority: ${role}`,
            hierarchyLevel: {
              assignerLevel: assignerMaxLevel,
              targetLevel: hierarchyCheck.targetLevel
            }
          },
          target: { userId: targetUserId },
          workflow: { reason, stage: 'rejected' },
          result: { 
            status: 'failure', 
            errorCode: 'HIERARCHY_VIOLATION',
            errorMessage: hierarchyCheck.message
          },
          security: { riskLevel: 'high' }
        }, assignerId);

        throw new Error(hierarchyCheck.message);
      }

      // Perform role assignment (your existing logic here)
      const assignmentResult = await this.executeRoleAssignment(
        assignerId, targetUserId, role, stateCode, districtCode, permissions, expiresAt, session
      );

      // Log successful assignment
      await this.logAudit({
        actor: await this.getAuditActor(assignerRegistry, assignerId),
        action: {
          type: 'role_assignment',
          resource: 'role_management',
          operation: 'create',
          description: `Assigned ${role} role to user ${targetUserId}`,
          hierarchyLevel: {
            assignerLevel: assignerMaxLevel,
            targetLevel: hierarchyCheck.targetLevel,
            levelDifference: assignerMaxLevel - hierarchyCheck.targetLevel
          }
        },
        target: {
          userId: targetUserId,
          beforeState: null,
          afterState: {
            role,
            level: hierarchyCheck.targetLevel,
            stateCode,
            districtCode,
            expiresAt
          }
        },
        jurisdiction: { stateCode, districtCode },
        workflow: { reason, stage: 'completed' },
        result: { status: 'success', affectedRecords: 1 },
        security: { riskLevel: 'medium' }
      }, assignerId);

      if (shouldEndSession) {
        await session.commitTransaction();
        session.endSession();
      }

      return assignmentResult;

    } catch (error) {
      if (shouldEndSession) {
        await session.abortTransaction();
        session.endSession();
      }
      
      await this.logAudit({
        actor: { userId: assignerId },
        action: {
          type: 'role_assignment',
          resource: 'role_management',
          operation: 'create',
          description: 'Role assignment failed'
        },
        target: { userId: targetUserId },
        result: { 
          status: 'failure', 
          errorCode: 'ASSIGNMENT_FAILED',
          errorMessage: error.message
        },
        security: { riskLevel: 'high' }
      }, assignerId);

      throw error;
    }
  }

  /**
   * 🔹 Remove Role with Audit
   */
  static async removeRole(removerId, removalData, session = null) {
    const { targetUserId, role, stateCode, districtCode, reason } = removalData;

    const shouldEndSession = !session;
    if (!session) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      const removerRegistry = await VerifierRegistry.findOne({ userId: removerId })
        .session(session);

      if (!removerRegistry) {
        throw new Error('Remover not found in registry');
      }

      // Get target's current state for audit
      const targetRegistry = await VerifierRegistry.findOne({ userId: targetUserId })
        .session(session);

      if (!targetRegistry) {
        throw new Error('Target user not found');
      }

      const beforeState = this.extractRoleState(targetRegistry, role, stateCode, districtCode);

      // Validate removal authority
      const removerMaxLevel = Math.max(...removerRegistry.states.flatMap(state => 
        state.roles.map(r => r.level)
      ));

      const targetRoleLevel = this.getRoleLevel(role);
      if (removerMaxLevel < targetRoleLevel) {
        throw new Error('Insufficient authority to remove this role');
      }

      // Perform role removal (your existing logic here)
      await this.executeRoleRemoval(targetUserId, role, stateCode, districtCode, session);

      // Log successful removal
      await this.logAudit({
        actor: await this.getAuditActor(removerRegistry, removerId),
        action: {
          type: 'role_revocation',
          resource: 'role_management',
          operation: 'delete',
          description: `Removed ${role} role from user ${targetUserId}`
        },
        target: {
          userId: targetUserId,
          beforeState,
          afterState: null
        },
        jurisdiction: { stateCode, districtCode },
        workflow: { reason, stage: 'completed' },
        result: { status: 'success', affectedRecords: 1 },
        security: { riskLevel: 'medium' }
      }, removerId);

      if (shouldEndSession) {
        await session.commitTransaction();
        session.endSession();
      }

      return { success: true, message: 'Role removed successfully' };

    } catch (error) {
      if (shouldEndSession) {
        await session.abortTransaction();
        session.endSession();
      }

      await this.logAudit({
        actor: { userId: removerId },
        action: {
          type: 'role_revocation',
          resource: 'role_management',
          operation: 'delete',
          description: 'Role removal failed'
        },
        target: { userId: targetUserId },
        result: { 
          status: 'failure', 
          errorCode: 'REMOVAL_FAILED',
          errorMessage: error.message
        },
        security: { riskLevel: 'high' }
      }, removerId);

      throw error;
    }
  }

  /**
   * 🔹 Update Permissions with Audit
   */
  static async updatePermissions(updaterId, updateData, session = null) {
    const { targetUserId, role, stateCode, districtCode, permissions, reason } = updateData;

    const shouldEndSession = !session;
    if (!session) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      const updaterRegistry = await VerifierRegistry.findOne({ userId: updaterId })
        .session(session);

      // Get before state for audit
      const targetRegistry = await VerifierRegistry.findOne({ userId: targetUserId })
        .session(session);

      const beforeState = this.extractPermissionState(targetRegistry, role, stateCode, districtCode);

      // Perform permission update (your existing logic here)
      const afterState = await this.executePermissionUpdate(
        targetUserId, role, stateCode, districtCode, permissions, session
      );

      // Log successful update
      await this.logAudit({
        actor: await this.getAuditActor(updaterRegistry, updaterId),
        action: {
          type: 'permission_update',
          resource: 'permission_management',
          operation: 'update',
          description: `Updated permissions for ${role} role`
        },
        target: {
          userId: targetUserId,
          beforeState,
          afterState
        },
        jurisdiction: { stateCode, districtCode },
        workflow: { reason, stage: 'completed' },
        result: { status: 'success', affectedRecords: permissions.length },
        security: { riskLevel: 'medium' }
      }, updaterId);

      if (shouldEndSession) {
        await session.commitTransaction();
        session.endSession();
      }

      return { success: true, updatedPermissions: permissions.length };

    } catch (error) {
      if (shouldEndSession) {
        await session.abortTransaction();
        session.endSession();
      }

      await this.logAudit({
        actor: { userId: updaterId },
        action: {
          type: 'permission_update',
          resource: 'permission_management',
          operation: 'update',
          description: 'Permission update failed'
        },
        target: { userId: targetUserId },
        result: { 
          status: 'failure', 
          errorCode: 'UPDATE_FAILED',
          errorMessage: error.message
        },
        security: { riskLevel: 'high' }
      }, updaterId);

      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  static async validateHierarchy(assignerLevel, targetRole, stateCode, districtCode, assignerRegistry) {
    const roleLevels = {
      'geo_analyst': 2,
      'senior_geo_officer': 3,
      'ai_model_custodian': 3,
      'district_mining_officer': 4,
      'state_mining_admin': 5,
      'ntro_nodal_officer': 6,
      'system_super_admin': 7
    };

    const targetLevel = roleLevels[targetRole];
    if (!targetLevel) {
      return { valid: false, message: 'Invalid role specified', targetLevel: 0 };
    }

    const maxAssignableLevel = this.getMaxAssignableLevel(assignerLevel);
    if (targetLevel > maxAssignableLevel) {
      return { 
        valid: false, 
        message: `Cannot assign ${targetRole} (level ${targetLevel}), maximum allowed: ${maxAssignableLevel}`,
        targetLevel 
      };
    }

    // Jurisdictional validation
    if (stateCode && assignerLevel < 6) { // NTRO+ can assign anywhere
      const hasStateAccess = assignerRegistry.states.some(state => 
        state.stateCode === stateCode && state.isActive
      );
      
      if (!hasStateAccess) {
        return { valid: false, message: 'No jurisdiction in specified state', targetLevel };
      }

      // District-level validation
      if (districtCode && assignerLevel < 5) {
        const hasDistrictAccess = assignerRegistry.states.some(state =>
          state.stateCode === stateCode &&
          state.districts.some(district => 
            district.districtCode === districtCode && district.isActive
          )
        );
        
        if (!hasDistrictAccess) {
          return { valid: false, message: 'No jurisdiction in specified district', targetLevel };
        }
      }
    }

    return { valid: true, targetLevel };
  }

  static getMaxAssignableLevel(userLevel) {
    const levelMatrix = {
      7: 7, // System Super Admin can assign all roles
      6: 5, // NTRO Nodal Officer can assign up to State Admin
      5: 4, // State Admin can assign up to District Officer
      4: 3, // District Officer can assign up to Senior Officer
      3: 2, // Senior Officer can assign only Geo Analyst
      2: 1, // Geo Analyst cannot assign any roles
      1: 1  // Public cannot assign roles
    };
    return levelMatrix[userLevel] || 1;
  }

  static getRoleLevel(role) {
    const roleLevels = {
      'geo_analyst': 2,
      'senior_geo_officer': 3,
      'ai_model_custodian': 3,
      'district_mining_officer': 4,
      'state_mining_admin': 5,
      'ntro_nodal_officer': 6,
      'system_super_admin': 7
    };
    return roleLevels[role] || 1;
  }

  static async getAuditActor(registry, userId) {
    const user = registry.userId || await mongoose.model('User').findById(userId);
    const primaryRole = registry.states[0]?.roles[0];
    
    return {
      userId: userId,
      registryId: registry._id,
      name: registry.name || user.name,
      email: registry.email || user.email,
      role: primaryRole?.role || 'unknown',
      level: primaryRole?.level || 1,
      department: registry.department || 'unknown'
    };
  }

  static extractRoleState(registry, role, stateCode, districtCode) {
    const state = registry.states.find(s => s.stateCode === stateCode);
    if (!state) return null;

    const roleObj = state.roles.find(r => r.role === role);
    if (!roleObj) return null;

    return {
      role: roleObj.role,
      level: roleObj.level,
      stateCode,
      districtCode,
      permissions: roleObj.permissions,
      status: roleObj.roleStatus,
      expiresAt: roleObj.roleExpiresAt
    };
  }

  static extractPermissionState(registry, role, stateCode, districtCode) {
    const state = registry.states.find(s => s.stateCode === stateCode);
    if (!state) return null;

    const roleObj = state.roles.find(r => r.role === role);
    if (!roleObj) return null;

    return roleObj.permissions.map(p => ({
      action: p.action,
      status: p.status,
      expiresAt: p.expiresAt
    }));
  }

  static async logAudit(auditData, userId) {
    try {
      // Add IP and user agent from request context if available
      const enhancedAuditData = {
        ...auditData,
        actor: {
          ...auditData.actor,
          ipAddress: auditData.actor.ipAddress || '0.0.0.0',
          userAgent: auditData.actor.userAgent || 'Unknown'
        }
      };

      await VerifierAuditLog.logVerifierAction(enhancedAuditData);
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  }

  // Placeholder for your existing implementation
  static async executeRoleAssignment(assignerId, targetUserId, role, stateCode, districtCode, permissions, expiresAt, session) {
    // Your existing role assignment logic from addRoleWithPermissions
    // This would integrate with your current implementation
    return { success: true, assignmentId: 'temp_id' };
  }

  static async executeRoleRemoval(targetUserId, role, stateCode, districtCode, session) {
    // Your existing role removal logic
    return { success: true };
  }

  static async executePermissionUpdate(targetUserId, role, stateCode, districtCode, permissions, session) {
    // Your existing permission update logic
    return permissions;
  }
}

export default PermissionService;