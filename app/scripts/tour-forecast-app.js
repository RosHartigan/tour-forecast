
var mapApp = angular.module('tour-forecast-app', ['uiGmapgoogle-maps', 'forecast-module', 'ui.bootstrap-slider'])

.config(['uiGmapGoogleMapApiProvider', '$httpProvider', function (GoogleMapApi) {
  GoogleMapApi.configure({
//    key: 'your api key',
    // v: '3.20',
    libraries: 'drawing,geometry,visualization,places'
  });
}])

// Enable AngularJS to send its requests with the appropriate CORS headers
  // globally for the whole app:

.run(['$templateCache', function ($templateCache) {
  $templateCache.put('searchboxStart.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Starting Location">');
  $templateCache.put('searchboxEnd.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Destination">');
  $templateCache.put('window.tpl.html', '<div ng-controller="WindowCtrl" ng-init="showPlaceDetails(parameter)">{{place.name}}</div>');
}])
.controller("tour-forecast-ctrl",['$scope', '$timeout', 'uiGmapLogger','uiGmapGoogleMapApi', 'forecastService',
function ($scope, $timeout, $log,GoogleMapApi, forecastService) {

 $log.currentLevel = $log.LEVELS.debug;

 GoogleMapApi.then(function(maps) {
    $scope.googleVersion = maps.version;
    maps.visualRefresh = true;   

    $scope.maps = maps;

    $scope.directionsDisplay = new $scope.maps.DirectionsRenderer({
        suppressMarkers: true
    });
    directionsDisplay.addListener('directions_changed', function() {
      $scope.createWeatherSteps(directionsDisplay.getDirections());
    });
   
  });
  
  angular.extend($scope, {
   
    map: {
      show: true,
      control: {},
      version: "uknown",
      
      center: {
        latitude: 39.5,
        longitude: -98.35
      },
      options: {
        streetViewControl: false,
        panControl: false,
        maxZoom: 20,
        minZoom: 3
      },
      zoom: 4,
      dragging: false,
      bounds: {},
      
    },
    searchboxStart: {
      template: 'searchboxStart.tpl.html',
      options: {
        visible: true,
        ref: "start"
      }
    },
    searchboxEnd: {
      template: 'searchboxEnd.tpl.html',
      options: {
        visible: true,
        ref: "end"
      }
      
    },
    searchbox: {
      events: {
        places_changed: function (searchBox) {
          places = searchBox.getPlaces()
        
          if (places.length == 0) {
            return;
          }
          
          $scope.routePlaces[searchBox.ref] = places[0];
          $scope.calcRoute($scope.routePlaces);
        }
      }
    },
    forecastMarkers: [],
    watchPoints: [],

    routePlaces: {
      start:null,
      end:null
    },

    departureTimeIdx: 0,

    departureTimeDisplay: "now",
    departureTimeDisplays: [{'display':"now", 'dateObj':null}]

  });

  // SLIDING TIME SELECTION
  // build a list of possible departure times for the slider
  $scope.rebuildDepartureTimes = function () {
      
    $scope.departureTimeIdx = 0;

    $scope.departureTimeDisplays = [{'display':"now", 'dateObj':null}];

    var nextTime = Date.now();
    nextTime.setMinutes(0,0,0);

    // also add the next few hours
    $scope.addDepartureTime(nextTime, 1);
    $scope.addDepartureTime(nextTime, 1);
    $scope.addDepartureTime(nextTime, 1);
    
    // every three hours for the first 24, starting on the next multiple of 3
    nextTime.setHours(nextTime.getHours() - nextTime.getHours() % 3);
    for( var idx = 0; idx < 24; idx += 3 ) {
      $scope.addDepartureTime(nextTime, 3);
    }

    // every 6 hours for the next 48
    for( var idx = 0; idx < 42; idx += 6 ) {
      $scope.addDepartureTime(nextTime, 6);
    }
  };

  // add a given departure time display and obj to the slider menu
  $scope.addDepartureTime = function(theDateTime, theHourOffset) {

    if( ! $scope.routePlaces.start ) {
      return;
    }

    theDateTime.add({ hours: theHourOffset});

    var theLocation = $scope.routePlaces.start.geometry.location;
    var dateTimeString = forecastService.createPrettyLocalDateTime(theLocation.latitide, theLocation.longitude, theDateTime);

    $scope.departureTimeDisplays.push(
      {
        'display':dateTimeString, 
        'dateObj': new Date(theDateTime.getTime())
      }
      );
  }

   // handle slide events
  $scope.slideDelegate = function (value, event) {
    $scope.forecastMarkers.forEach(function(geoJSON) {
      var dt =  $scope.departureTimeDisplays[value].dateObj;
      if( dt === null ) {
        dt = Date.now();
      }
      forecastService.updateGeoJSONInstance(geoJSON, dt);
    });
  };

  $scope.createWeatherSteps = function(directions) {

      // reset our directions markers
      $scope.forecastMarkers = [];

      // reset our departure time list
      $scope.rebuildDepartureTimes();

      // if there's no directions, we;re done
      if( !directions || !directions.routes  || directions.routes.length === 0 ) {
        return;
      }
    
      var myRoute = directions.routes[0].legs[0];
      var steps = myRoute.steps;
      
      var travelSecs = 0; // in seconds
      var distanceMeters = 0; // in meters
      var departureTime = new Date();
      
      var lastTime = 0;
      var lastDistance = 0;

      for( var ii =0; ii < steps.length; ii++ ) {
        var step = steps[ii];
        
        if( ii === 0 || lastTime <= travelSecs - 60*60 || lastDistance <= distanceMeters - 100*1000  ) {  
          var gj = forecastService.createGeoJSONInstance(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(),departureTime, distanceMeters, travelSecs);
          $log.debug(ii + " " + travelSecs);
          $scope.forecastMarkers.push(gj);
          lastTime = travelSecs;
          lastDistance = distanceMeters;
        }
        distanceMeters += step.distance.value;
        travelSecs += step.duration.value;
      }

      // now add end location
      var gjend = forecastService.createGeoJSONInstance(myRoute.end_location.lat(), myRoute.end_location.lng(), departureTime, myRoute.distance.value, myRoute.duration.value);
      $log.debug(gjend);
      $scope.forecastMarkers.push(gjend);
  }

  // get google directions
  $scope.calcRoute = function (routePlaces) {
    if( routePlaces.start === null || routePlaces.end === null ) {
      return;
    }

    var request = {
      origin: routePlaces.start.geometry.location,
      destination: routePlaces.end.geometry.location,
      travelMode: $scope.maps.TravelMode.DRIVING,
      provideRouteAlternatives: true
    };

    var directionsService = new $scope.maps.DirectionsService();
    directionsService.route(request, function(directionResult, status) {


      if (status === $scope.maps.DirectionsStatus.OK || status === $scope.maps.DirectionsStatus.ZERO_RESULTS) {

          $scope.createWeatherSteps(directionResult);
      
          $log.debug("DirectionsResult", directionResult);

          // display the directions on the map and in the steps
          $scope.directionsDisplay.setMap($scope.map.control.getGMap());
          $scope.directionsDisplay.setPanel(document.getElementById("directionSteps"));
          $scope.directionsDisplay.setDirections(directionResult);
        }
        else {
          $scope.createWeatherSteps(null);
          $scope.directionsDisplay.setDirections(null);         
        }
      });
  };
 
  
}])

