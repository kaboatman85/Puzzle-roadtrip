/* Photo theme per trip: a short list of Wikimedia Commons categories that every puzzle on
   that trip draws from. Verified against the live Commons API with verify-categories.js —
   run that after editing this file to check new/changed categories still resolve. */
(function (root) {
  'use strict';

  var THEMES = {
    'sea-key': { name: 'Famous buildings and monuments', emoji: '🏛️', categories: [
      'Featured pictures of buildings in the United States',
      'Quality images of buildings in the United States',
      'Monuments and memorials in the United States',
      'Skyscrapers in the United States',
      'City halls in the United States',
      'State capitols in the United States',
      'Lincoln Memorial',
      'Washington Monument',
      'Mount Rushmore National Memorial'
    ] },
    'route66': { name: 'Roadside Americana', emoji: '🛣️', categories: [
      'Neon signs in the United States',
      'Roadside attractions in the United States',
      'Vintage cars',
      'U.S. Route 66',
      'Motels in the United States',
      'Gas stations in the United States',
      'Diners in the United States',
      'Googie architecture',
      'Trading posts in the United States',
      'Advertising signs in the United States',
      'Billboards in the United States'
    ] },
    'pacific': { name: 'Lighthouses and coastal scenery', emoji: '🌊', categories: [
      'Beaches of California',
      'Featured pictures of coasts',
      'Lighthouses in California',
      'Sea cliffs',
      'Featured pictures of lighthouses in the United States',
      'Lighthouses in Oregon',
      'Lighthouses in Washington (state)'
    ] },
    'coast2coast': { name: 'Bridges and city skylines', emoji: '🌉', categories: [
      'Featured pictures of skylines',
      'Quality images of bridges',
      'Night skylines',
      'Featured pictures of bridges in the United States',
      'Brooklyn Bridge',
      'Steel bridges in the United States',
      'Featured pictures of New York City',
      'George Washington Bridge',
      'Verrazzano-Narrows Bridge',
      'San Francisco–Oakland Bay Bridge',
      'Cable-stayed bridges in the United States',
      'Suspension bridges in the United States',
      'Golden Gate Bridge',
      'Skylines in the United States'
    ] },
    'appalachians': { name: 'National parks and mountain scenery', emoji: '🏔️', categories: [
      'Featured pictures of mountains',
      'Blue Ridge Mountains',
      'Shenandoah National Park',
      'Autumn in West Virginia',
      'Appalachian Mountains',
      'Great Smoky Mountains National Park',
      'Autumn in the United States'
    ] },
    'greatlakes': { name: 'Great Lakes shoreline scenery', emoji: '🚢', categories: [
      'Mackinac Bridge',
      'Lake Superior',
      'Lake Huron',
      'Lake Michigan',
      'Lighthouses in Michigan',
      'Door County, Wisconsin',
      'Great Lakes',
      'Traverse City, Michigan',
      'Lighthouses in Wisconsin'
    ] },
    'gulfcoast': { name: 'Gulf Coast beaches and bayous', emoji: '🏖️', categories: [
      'Beaches of Florida',
      'Panama City Beach, Florida',
      'Biloxi, Mississippi',
      'Featured pictures of Florida',
      'Gulf Coast of the United States',
      'Beaches of Texas',
      'Galveston, Texas',
      'Beaches of Alabama',
      'Bayous',
      'Sarasota, Florida',
      'Corpus Christi, Texas',
      'Mobile, Alabama'
    ] },
    'redrock': { name: 'Desert canyons and red rock formations', emoji: '🏜️', categories: [
      'Canyonlands National Park',
      'Arches National Park',
      'Grand Canyon',
      'Monument Valley',
      'Bryce Canyon National Park',
      'Zion National Park',
      'Featured pictures of Utah'
    ] },
    'mississippi': { name: 'River scenery and river towns', emoji: '🚤', categories: [
      'Rivers of the United States',
      'Vicksburg National Military Park',
      'Mississippi River',
      'Steamboats of the United States',
      'Bridges over the Mississippi River',
      'Vicksburg, Mississippi',
      'Memphis, Tennessee',
      'La Crosse, Wisconsin',
      'Natchez, Mississippi',
      'Dubuque, Iowa'
    ] },
    'newengland': { name: 'Fall foliage and coastal New England', emoji: '🍁', categories: [
      'White Mountains (New Hampshire)',
      'Portland, Maine',
      'Covered bridges in Vermont',
      'Stowe, Vermont',
      'Lighthouses in Maine',
      'Acadia National Park',
      'Autumn in New England',
      'Covered bridges in the United States',
      'Freeport, Maine',
      'Covered bridges in New Hampshire',
      'Lighthouses in Massachusetts',
      'Lighthouses in Rhode Island',
      'Newport, Rhode Island',
      'Lighthouses in Connecticut'
    ] },
    'lonestar': { name: 'Texas wildflowers and hill country', emoji: '🌻', categories: [
      'Lupinus texensis',
      'Texas Hill Country',
      'Fredericksburg, Texas',
      'Ranches in Texas',
      'Featured pictures of Texas',
      'Vineyards in Texas',
      'Enchanted Rock State Natural Area',
      'Pedernales Falls State Park',
      'New Braunfels, Texas',
      'Johnson City, Texas',
      'Llano, Texas'
    ] }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = THEMES;
  else root.TRIP_THEMES = THEMES;
})(typeof window !== 'undefined' ? window : this);
