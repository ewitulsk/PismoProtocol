import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, headers: customHeaders = {}, queryParams = {} } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Build URL with query parameters
    const requestUrl = new URL(url);
    Object.keys(queryParams).forEach(key => {
      requestUrl.searchParams.append(key, queryParams[key]);
    });

    // Prepare headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'PismoProtocol-Oracle-Builder/1.0',
      ...customHeaders
    };

    // Make the API request
    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }

    // Try to parse as JSON
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If not JSON, return the text response
      const text = await response.text();
      return NextResponse.json({
        success: true,
        data: {
          _raw_response: text,
          _note: 'Response was not valid JSON, returned as text'
        },
        metadata: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        }
      });
    }

    return NextResponse.json({
      success: true,
      data,
      metadata: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      }
    });

  } catch (error) {
    console.error('API test error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
