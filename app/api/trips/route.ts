import { NextRequest, NextResponse } from 'next/server'

interface Trip {
  uid: string
  plannedDurationInMinutes: number
  transfers: number
  legs: Array<{
    origin: { name: string; plannedDateTime: string; actualDateTime?: string }
    destination: { name: string; plannedDateTime: string; actualDateTime?: string }
    product: { displayName: string; operatorName: string }
    stops?: Array<{ name: string }>
  }>
  crowdForecast: string
  punctuality: number
}

interface TravelAdvice {
  source: string
  trips: Trip[]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const fromStation = searchParams.get('fromStation')
  const toStation = searchParams.get('toStation')
  const dateTime = searchParams.get('dateTime')
  const searchForArrival = searchParams.get('searchForArrival') === 'true'

  if (!fromStation || !toStation) {
    return NextResponse.json(
      { error: 'fromStation and toStation are required' },
      { status: 400 }
    )
  }

  try {
    const params = new URLSearchParams({
      fromStation,
      toStation,
      ...(dateTime && { dateTime }),
      ...(searchForArrival && { searchForArrival: 'true' }),
      lang: 'nl',
    })

    const apiKey = process.env.NS_API_KEY
    if (!apiKey) {
      console.error('NS_API_KEY not configured')
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    const response = await fetch(
      `https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/trips?${params.toString()}`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error(`NS API error: ${response.status}`)
      return NextResponse.json(
        { error: 'Failed to fetch trips' },
        { status: response.status }
      )
    }

    const data = await response.json() as TravelAdvice[]
    return NextResponse.json(data)
  } catch (error) {
    console.error('Trip search error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trips' },
      { status: 500 }
    )
  }
}
