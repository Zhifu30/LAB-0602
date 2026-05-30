import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface EditPermissionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const EditPermissionGuard: React.FC<EditPermissionGuardProps> = ({ 
  children, 
  fallback = null 
}) => {
  const { canEditWebsite, user } = useAuth();
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      if (!user) {
        setCanEdit(false);
        setLoading(false);
        return;
      }

      try {
        const hasPermission = await canEditWebsite();
        setCanEdit(hasPermission);
      } catch (error) {
        console.error('Error checking edit permission:', error);
        setCanEdit(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [user, canEditWebsite]);

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (!canEdit) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default EditPermissionGuard;