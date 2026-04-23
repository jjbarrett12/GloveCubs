/**
 * Supplier Feed Upload API
 * 
 * Supports:
 * - CSV files
 * - XLSX files (Excel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/supplier-portal/auth';
import {
  createFeedUpload,
  processFeedUpload,
  getUploadRows,
  getUploadStatus,
  correctRow,
  commitFeedUpload,
  detectFileType,
  validateFile,
} from '@/lib/supplier-portal/feedUpload';

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
    const uploadId = searchParams.get('upload_id');
    
    switch (action) {
      case 'status': {
        if (!uploadId) {
          return NextResponse.json({ error: 'Upload ID required' }, { status: 400 });
        }
        
        const status = await getUploadStatus(uploadId, session.supplier_id);
        return NextResponse.json({ data: status });
      }
      
      case 'rows': {
        if (!uploadId) {
          return NextResponse.json({ error: 'Upload ID required' }, { status: 400 });
        }
        
        const filter = searchParams.get('filter') as 'all' | 'valid' | 'warning' | 'error' | undefined;
        const rows = await getUploadRows(uploadId, session.supplier_id, filter);
        return NextResponse.json({ data: rows });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Feed upload GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSupplierFromSession(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const contentType = request.headers.get('content-type') || '';
    
    // Handle multipart form data for file upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'File too large. Maximum size is 10 MB.' },
          { status: 400 }
        );
      }
      
      // Detect file type from filename
      const detectedType = detectFileType(file.name);
      if (detectedType === 'unknown') {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload a CSV or XLSX file.' },
          { status: 400 }
        );
      }
      
      const fileType: 'csv' | 'xlsx' = detectedType;
      
      // Read file content - binary for XLSX, text for CSV
      let content: string | ArrayBuffer;
      if (fileType === 'xlsx') {
        content = await file.arrayBuffer();
      } else {
        content = await file.text();
      }
      
      // Validate file before processing
      const validation = validateFile(file.name, content, fileType);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'File validation failed',
            details: {
              errors: validation.errors,
              warnings: validation.warnings,
            },
          },
          { status: 400 }
        );
      }
      
      // Create upload record
      const uploadId = await createFeedUpload(
        session.supplier_id,
        session.user_id,
        file.name,
        fileType
      );
      
      // Process the upload
      const result = await processFeedUpload(
        uploadId,
        session.supplier_id,
        session.user_id,
        content,
        fileType
      );
      
      // Include validation warnings in response
      return NextResponse.json({
        data: result,
        validation_warnings: validation.warnings,
      });
    }
    
    // Handle JSON actions
    const body = await request.json();
    const { action } = body;
    
    switch (action) {
      case 'correct': {
        const { upload_id, row_number, corrections } = body;
        
        if (!upload_id || !row_number) {
          return NextResponse.json({ error: 'Upload ID and row number required' }, { status: 400 });
        }
        
        const correctedRow = await correctRow(upload_id, session.supplier_id, row_number, corrections);
        return NextResponse.json({ data: correctedRow });
      }
      
      case 'commit': {
        const { upload_id, row_numbers } = body;
        
        if (!upload_id) {
          return NextResponse.json({ error: 'Upload ID required' }, { status: 400 });
        }
        
        const result = await commitFeedUpload(
          upload_id,
          session.supplier_id,
          session.user_id,
          row_numbers
        );
        
        return NextResponse.json({ data: result });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Feed upload POST error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
