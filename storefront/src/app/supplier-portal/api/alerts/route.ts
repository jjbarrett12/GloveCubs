/**
 * Supplier Portal Alerts API
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/supplier-portal/auth';
import {
  listAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  dismissAlert,
  getAlertCounts,
} from '@/lib/supplier-portal/alerts';

async function getSupplierFromSession(request: NextRequest): Promise<{ supplier_id: string; user_id: string } | null> {
  const token = request.cookies.get('supplier_session')?.value;
  if (!token) return null;
  
  const result = await validateSession(token);
  if (!result.valid || !result.supplier_id || !result.user) return null;
  
  return { supplier_id: result.supplier_id, user_id: result.user.id };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSupplierFromSession(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'list': {
        const result = await listAlerts(session.supplier_id, {
          unread_only: searchParams.get('unread_only') === 'true',
          severity: searchParams.get('severity') as 'critical' | 'warning' | 'info' | undefined,
          limit: parseInt(searchParams.get('limit') || '50'),
          offset: parseInt(searchParams.get('offset') || '0'),
        });
        return NextResponse.json(result);
      }
      
      case 'counts': {
        const counts = await getAlertCounts(session.supplier_id);
        return NextResponse.json({ data: counts });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Alerts API GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSupplierFromSession(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { action } = body;
    
    switch (action) {
      case 'mark-read': {
        if (!body.alert_id) {
          return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
        }
        
        const success = await markAlertAsRead(
          session.supplier_id,
          session.user_id,
          body.alert_id
        );
        
        return NextResponse.json({ success });
      }
      
      case 'mark-all-read': {
        const count = await markAllAlertsAsRead(session.supplier_id, session.user_id);
        return NextResponse.json({ success: true, count });
      }
      
      case 'dismiss': {
        if (!body.alert_id) {
          return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
        }
        
        const success = await dismissAlert(
          session.supplier_id,
          session.user_id,
          body.alert_id
        );
        
        return NextResponse.json({ success });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Alerts API POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
