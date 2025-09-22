const functions = require('firebase-functions');
const { Client } = require('@googlemaps/google-maps-services-js');
const cors = require('cors')({ origin: true }); // Add this line

// Initialize Google Maps client
const mapsClient = new Client({});
const MAPS_API_KEY = "AIzaSyA82OORs1OmOmhd4KKNGfDlkVRcew3v8u8";

// Create the Cloud Function with proper CORS handling
// In your Firebase Cloud Functions file (functions/index.js or similar)
// Add this to your suggestStops function instead of calling the Cloud Function
const suggestStops = async () => {
  if (!form.start || !form.end) {
    toast.error('Please enter both start and end locations');
    return;
  }

  try {
    setLoadingSuggest(true);
    
    // Direct API call to Google Maps Directions API
    const directionsResponse = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(form.start)}&destination=${encodeURIComponent(form.end)}&key=YOUR_GOOGLE_MAPS_API_KEY`
    );
    
    const directionsData = await directionsResponse.json();
    
    if (!directionsData.routes?.[0]) {
      throw new Error('No route found');
    }
    
    // Process the response and extract stops
    const route = directionsData.routes[0];
    const stops = [];
    
    // Add your stop extraction logic here
    // This would be similar to what was in your Cloud Function
    
    setForm(prev => ({
      ...prev,
      stops,
      totalDistance: (route.legs[0].distance.value / 1000).toFixed(1),
      estimatedDuration: route.legs[0].duration.text
    }));
    
    toast.success(`Found ${stops.length} stops on the route`);
  } catch (error) {
    console.error('Error suggesting stops:', error);
    toast.error(error.message || 'Failed to suggest stops');
  } finally {
    setLoadingSuggest(false);
  }
};
// Helper function to format minutes into HH:mm
function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}