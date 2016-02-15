  // Copyright 2016 Rosalind Hartigan
  // tour-forecast-app.js is part of TourForecast
  //
  //-TourForecast is free software: you can redistribute it and/or modify
  // it under the terms of the GNU General Public License as published by
  // the Free Software Foundation, either version 3 of the License, or
  // (at your option) any later version.

  // TourForecast is distributed in the hope that it will be useful,
  // but WITHOUT ANY WARRANTY; without even the implied warranty of
  // MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  // GNU General Public License for more details.

  // You should have received a copy of the GNU General Public License
  // along with this program.  If not, see <http://www.gnu.org/licenses/>.

var mapApp = angular.module('tourForecastApp', ['uiGmapgoogle-maps', 'tourForecast.services', 'tourForecast.directives', 'ui.bootstrap-slider', 'nemLogging'])

.config(['uiGmapGoogleMapApiProvider', '$httpProvider', function (GoogleMapApi) {
  GoogleMapApi.configure({
//    key: 'your api key',
    // v: '3.20',
    libraries: 'drawing,geometry,visualization,places'
  });
}])
.run(['$templateCache', function ($templateCache) {
  $templateCache.put('searchboxStart.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Starting Location">');
  $templateCache.put('searchboxEnd.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Destination">');
  $templateCache.put('window.tpl.html', '<div ng-controller="WindowCtrl" ng-init="showPlaceDetails(parameter)">{{place.name}}</div>');
}])
.controller("tourForecastCtrl",['$scope', 'nemSimpleLogger','uiGmapGoogleMapApi', 'forecastService', 'forecastLocationFactory',
function ($scope, $log,GoogleMapApi, forecastService, forecastLocationFactory) {

 $log.currentLevel = $log.LEVELS.debug;

 GoogleMapApi.then(function(maps) {
    $scope.googleVersion = maps.version;
    maps.visualRefresh = true;   

    $scope.maps = maps;

    $scope.directionsDisplay = new $scope.maps.DirectionsRenderer({
        suppressMarkers: true
    });
    $scope.directionsDisplay.addListener('directions_changed', function() {
      $log.debug('directions_changed');
      $scope.createWeatherStepsFromDirections($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
    });
    $scope.directionsDisplay.addListener('routeindex_changed', function() {
      $log.debug('routeindex_changed ' + $scope.directionsDisplay.getRouteIndex());
      if( $scope.routeUpToDate ) {
        $scope.createWeatherStepsFromDirections($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
      }
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
    
    routePlaces: {
      start:null,
      end:null
    },

    routeUpToDate : false
  });

  
  $scope.createWeatherStepsFromDirections = function(directions, routeIdx) {

      // reset our directions markers
      $scope.forecastMarkers = [];

      // if there's no directions, we;re done
      if( !directions || !directions.routes  || directions.routes.length <= routeIdx) {
        return;
      }

      $scope.routeUpToDate = true;

      // calcualte the weather steps for each leg    
      for( var idx = 0; idx < directions.routes[routeIdx].legs.length; idx++) {
        forecastLocationFactory.addWeatherStepsFromLeg(directions.routes[routeIdx].legs[idx], $scope.forecastMarkers, $scope.maps);
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
          // tell the scope that our route is out of date
          $scope.routeUpToDate = false;

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

