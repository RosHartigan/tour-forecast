
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
    $scope.directionsDisplay.addListener('directions_changed', function() {
//      $scope.createWeatherSteps($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
    });
    $scope.directionsDisplay.addListener('routeindex_changed', function() {
      $scope.createWeatherSteps($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
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

    if( $scope.forecastMarkers.length === 0) {
      return;
    }
    var nextTime = new Date();
    nextTime.setMinutes(0);
    nextTime.setSeconds(0);
    nextTime.setMilliseconds(0);

    // also add the next few hours
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

    var theLocation =  $scope.forecastMarkers[0].properties;
    var dateTimeString = forecastService.createPrettyLocalDateTime(theLocation.latitude, theLocation.longitude, theDateTime);

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
        dt = new Date();
      }
      forecastService.updateGeoJSONInstance(geoJSON, dt);
    });
  };

  // watching so we an update the time.... there has to 
  // be a better way...
  $scope.$watch(
    function watchForecastModelTimezone( scope ) {
        // Return the "result" of the watch expression.
        if( $scope.forecastMarkers.length > 0) {
          return $scope.forecastMarkers[0].properties.icon;
        }
        return( "" );
    },
    function handleChange( newValue, oldValue ) {
        $scope.rebuildDepartureTimes();
    }
  );
  $scope.createWeatherSteps = function(directions, routeIdx) {

      // reset our directions markers
      $scope.forecastMarkers = [];

      // if there's no directions, we;re done
      if( !directions || !directions.routes  || directions.routes.length <= routeIdx) {
        return;
      }
    
      // should add this for each leg
      var myLeg = directions.routes[routeIdx].legs[0];
      var travelSecs = 0; // in seconds
      var distanceMeters = 0; // in meters
      var departureTime = new Date();
      
      // first add star and end locations
      var gj = forecastService.createGeoJSONInstance(myLeg.start_location.lat(), myLeg.start_location.lng(), departureTime, 0, 0);
      $scope.forecastMarkers.push(gj);    

      gj = forecastService.createGeoJSONInstance(myLeg.end_location.lat(), myLeg.end_location.lng(), departureTime, myLeg.distance.value, myLeg.duration.value);
      $scope.forecastMarkers.push(gj);    


      // now parse through steps to add additional locations
      // approx every 100 KM
      var lastDistance = 0;
      var STEP_LENGTH = 100*1000;   // forecast step every 100 km
      var SLUSH = 10 *1000;         //  plus or minus 10k km
      var PIOVER180 = Math.PI / 180;
      var RADIUS = 6378 * 1000;  // radius of earth in meters
    
      var steps = myLeg.steps;

      for( var ii =0; ii < steps.length && (myLeg.distance.value - distanceMeters) > (STEP_LENGTH+SLUSH) ; ii++ ) {
        
        var step = steps[ii];

        // add the step itself if its at APPROX the right distance
        if(  (distanceMeters - lastDistance) > (STEP_LENGTH - SLUSH)  ) {  
          var gj = forecastService.createGeoJSONInstance(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(),departureTime, distanceMeters, travelSecs);
          $scope.forecastMarkers.push(gj);
          lastDistance = distanceMeters;
        }

        
        // if the next step is too far away... add some intermediate locations
        // calculate distance from latlngs describing the path
        var interStepDist = 0;
        var a2 = step.lat_lngs[0].lat() * PIOVER180
        var b2 = step.lat_lngs[0].lng() * PIOVER180;
        for( jj = 1; jj < step.lat_lngs.length && (distanceMeters + step.distance.value - lastDistance) >= STEP_LENGTH; jj++ ) {
          var a1 = a2;
          var b1 = b2;
          a2 = step.lat_lngs[jj].lat() * PIOVER180;
          b2 = step.lat_lngs[jj].lng() * PIOVER180;
          var d = Math.acos(Math.cos(a1)*Math.cos(b1)*Math.cos(a2)*Math.cos(b2) + Math.cos(a1)*Math.sin(b1)*Math.cos(a2)*Math.sin(b2) + Math.sin(a1)*Math.sin(a2)) * RADIUS;
          
          interStepDist += d;

          if( (distanceMeters + interStepDist - lastDistance) >= STEP_LENGTH ) {
            $log.debug(lastDistance/1000.0);
          
            var gj = forecastService.createGeoJSONInstance(step.lat_lngs[jj].lat(), step.lat_lngs[jj].lng(),departureTime, lastDistance+interStepDist, travelSecs);
            $scope.forecastMarkers.push(gj);
            lastDistance += interStepDist;
            interStepDist = 0;
          }
        }
        
        distanceMeters += step.distance.value;
        travelSecs += step.duration.value;
      }

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
          $log.debug("DirectionsResult");
          $log.debug(directionResult);

          // display the directions on the map and in the steps
          $scope.directionsDisplay.setMap($scope.map.control.getGMap());
          $scope.directionsDisplay.setPanel(document.getElementById("directionSteps"));
          $scope.directionsDisplay.setDirections(directionResult);
        }
        else {
          $scope.directionsDisplay.setDirections(null);         
        }
      });
  };
 
  
}])

