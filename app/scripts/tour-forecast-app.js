
var mapApp = angular.module('tour-forecast-app', ['uiGmapgoogle-maps'])

.config(['uiGmapGoogleMapApiProvider', '$httpProvider', function (GoogleMapApi, $httpProvider) {
  GoogleMapApi.configure({
//    key: 'your api key',
    // v: '3.20',
    libraries: 'drawing,geometry,visualization,places'
  });
          $httpProvider.defaults.useXDomain = true;

          /**
           * Just setting useXDomain to true is not enough. AJAX request are also
           * send with the X-Requested-With header, which indicate them as being
           * AJAX. Removing the header is necessary, so the server is not
           * rejecting the incoming request.
           **/
          delete $httpProvider.defaults.headers.common['X-Requested-With'];
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

  });
  
  angular.extend($scope, {
   
    map: {
      show: true,
      control: {},
      version: "uknown",
      
      center: {
        latitude: 45,
        longitude: -73
      },
      options: {
        streetViewControl: false,
        panControl: false,
        maxZoom: 20,
        minZoom: 3
      },
      zoom: 3,
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
      //parentdiv:'searchBoxParent',
      events: {
        places_changed: function (searchBox) {
          places = searchBox.getPlaces()
        
          if (places.length == 0) {
            return;
          }
          forecastService.addForecastForLocation(places[0].geometry.location.lat(), places[0].geometry.location.lng(), 0, 0, new Date() );
           

          $scope.routePlaces[searchBox.ref] = places[0];
          $scope.calcRoute($scope.routePlaces);
        }
      }
    },
    forecastMarkers: [
        {
          id: "45,-75",
          "type":"Feature",
          "geometry": { "type": "Point", "coordinates": [42.65, -83.3] },
          "properties" : 
            { 
              "latitude": 42.65,
              "longitude":-83.3,
              "icon": "http://forecast.weather.gov/newimages/medium/ra_sn50.png",
              "place_description" : "Somewhere: 45, -75"
            }
         
        }],


    routePlaces: {
      start:null,
      end:null
    }

  });


  // get google directions
  $scope.calcRoute = function (routePlaces) {
    if( routePlaces.start === null || routePlaces.end === null ) {
      return;
    }
    var directionsDisplay = new $scope.maps.DirectionsRenderer();
    directionsDisplay.setMap($scope.map.control.getGMap());
    
    $scope.forecastMarkers = [];

    var request = {
      origin: routePlaces.start.geometry.location,
      destination: routePlaces.end.geometry.location,
      travelMode: $scope.maps.TravelMode.DRIVING
    };

    var directionsService = new $scope.maps.DirectionsService();
    directionsService.route(request, function(directionResult, status) {
      if (status == $scope.maps.DirectionsStatus.OK) {
          // display the directions
          directionsDisplay.setPanel(document.getElementById("directionSteps"));
          directionsDisplay.setDirections(directionResult);

          var myRoute = directionResult.routes[0].legs[0];
          var steps = myRoute.steps;

          for( var ii =0; ii < steps.length; ii++ ) {
            var step = steps[ii];
            //$log.debug(step);
            var gj =  forecastService.addForecastForLocation(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(), step.duration.value, step.distance.value, new Date() );
            $scope.forecastMarkers.push(gj);
          }
  
          // start working on the weather
        }
      });
  };
 /* $scope.$watch('forecastMarkers', function() {
         $log.debug("watching...");
         $log.debug($scope.forecastMarkers);
           
    }, true);*/
}])

.service('forecastService', function($http, $q, pointForecast) {
  var pointForecasts = [];

  this.addForecastForLocation = function(latitude, longitude, duration, distance, departureTime) {
    var pointId = pointForecast.generateId(latitude, longitude);
    var pf = pointForecasts[pointId];
    if( pf !== undefined ) {
      pf.duration = duration;
      pf.distance=distance;
    }
    else {

      pf = new pointForecast(latitude, longitude, duration, distance);
      pointForecasts[location.toString()] = pf;
    }

    if( pf.isCurrent === false ) {
      return pf.createGeoJSONForDepartureTime(departureTime);
    }

    return pf.fetchGeoJSON;
  }


  // fetch the foreast and store it in the geoJSON associated with the point
  this.getDWMLForecast = function(location) {

  }

    
})
.factory('pointForecast', function ($http, $q, $log) {
  // constructor
  function pointForecast(latitude, longitude, duration, distance) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.id = pointForecast.generateId(latitude,longitude);
    this.duration = duration;
    this.distance = distance;
    this.isCurrent = false;
    this.forecast = {};

    return this;
  }

  pointForecast.generateId = function(latitude, longitude) {
      $log.debug(latitude*1000 +longitude);
      return latitude*1000 +longitude;
  };

  // create a geoJSON object which contains forecast data for 
  // this location, given the specified departure time
  pointForecast.prototype.createGeoJSONForDepartureTime = function(departureTime) {
    var arrivalTime = new Date();
    arrivalTime.setTime(departureTime.getTime() + this.duration * 1000);
    var geoJSON = {"type" : "Feature", "id":this.id, 
        "properties": { "icon":"", "departureTime": departureTime, "arrivalTime": arrivalTime, "latitude":this.latitude,"longitude":this.longitude }};
    geoJSON.geometry = { "type": "Point",  "coordinates": [this.latitude, this.longitude]};
    geoJSON.properties.icon = "http://forecast.weather.gov/images/wtf/small/ovc.png";

    if( this.isCurrent ) {
      this.updateGeoJSON(geoJSON);
    }
    else if (this.fetchGeoJSON !== undefined ) {
      // just update the one we're waiting on
      this.fetchGEOJson.departureTime = departureTime;
      geoJSON = this.fetchGEOJson;
    }
    else {
      this.fetchGeoJSON = geoJSON;
      this.get_NWS_Forecast(departureTime);
    }
    return geoJSON;
  }

  // gather all the forecast data for the right time for this point, 
  // assemble into geoJSON.properties
  pointForecast.prototype.updateGeoJSON = function(geoJSON) {



    var dtime_string = geoJSON.properties.arrivalTime.toISOString();

     $log.debug(dtime_string);
    if( this.forecastGeoJSON !== undefined && this.forecastGeoJSON.properties !== undefined && this.forecastGeoJSON.properties.forecastSeries !== undefined){
      for( var timekey in this.forecastGeoJSON.properties.forecastSeries) {
        if( dtime_string >= timekey  && dtime_string < this.forecastGeoJSON.properties.forecastSeries[timekey]['timeend_utc']) {
          $log.debug(timekey);
          geoJSON.properties.icon = this.forecastGeoJSON.properties.forecastSeries[timekey]['weather-icon'];
          geoJSON.properties.weather = this.forecastGeoJSON.properties.forecastSeries[timekey]['weather-summary'];
          $log.debug(geoJSON.properties.arrivalTime.toString());
          $log.debug(this.forecastGeoJSON.geometry.coordinates);
          $log.debug(this.forecastGeoJSON.properties.forecastSeries[timekey]['weather-icon']);
          $log.debug(this.forecastGeoJSON.properties.forecastSeries[timekey]['weather-summary']);

        }

      }
    }
   
  }
  // get the National Weather Service gml forecast
  pointForecast.prototype.get_NWS_Forecast = function(departureTime) {

    var me = this;
    var url = "/cgi-bin/nws_forecast.pl";
    $http.get(url, {
            params: { lat: me.latitude, lon : me.longitude }
        })
          .then(function(response) {
              if (typeof response.data === 'object') {
                  me.isCurrent = true;
                  me.forecastGeoJSON = response.data.features;
                  if( me.fetchGeoJSON !== undefined ) {
                    me.updateGeoJSON(me.fetchGeoJSON);
                  }
              } else {
                  // invalid response
                  return $q.reject(response.data);
              }

          }, function(response) {
              // something went wrong
              return $q.reject(response.data);
          });

  }


  // get the National Weather Service gml forecast
  pointForecast.prototype.get_NWS_GML_Forecast = function() {

    var url = "/nws_gml/xml/sample_products/browser_interface/ndfdXMLclient.php?gmlListLatLon=" + this.id + "&featureType=Forecast_Gml2Point&startTime=2013-02-28T19:14:00&compType=Between&propertyName=icons,wx";
    $http.get(url)
          .then(function(response) {
              if (typeof response.data === 'string') {
                  this.isCurrent = true;

                  var gmlDoc;
                  if (window.DOMParser)
                    {
                      parser=new DOMParser();
                      gmlDoc=parser.parseFromString(response.data,"text/xml");
                    }
                  else // Internet Explorer
                    {
                      gmlDoc=new ActiveXObject("Microsoft.XMLDOM");
                      gmlDoc.async=false;
                      gmlDoc.loadXML(response.data);
                    }
                  

                    var forecasts = [];
                    var features = gmlDoc.getElementsByTagName("app:Forecast_Gml2Point");
                    for( var ff = 0; ff < features.length; ff++ ) {
                      var weatherPhraseNode =  features[ff].getElementsByTagName("app:weatherPhrase").item(0);
                      var weatherIconNode =  features[ff].getElementsByTagName("app:weatherIcon").item(0);
                      
                      var validStartTimes = features[ff].getElementsByTagName("app:validTime");
                      for( var tt=0; tt < validStartTimes.length; tt++ ) {
                        var timeKey = validStartTimes[tt].textContent;
                        var timeObject = forecasts[timeKey];
                        $log.debug(timeKey);                        
                        if( timeObject === null || timeObject === undefined ) {
                          timeObject = {};
                          forecasts[timeKey] = timeObject;
                        }
                        if( weatherIconNode !== null ) {
                          timeObject.weatherIcon = weatherIconNode.textContent;
                          $log.debug(timeObject.weatherIcon);
                        }
                        if( weatherPhraseNode !== null ) {
                          timeObject.weatherPhrase = weatherPhraseNode.textContent;
                          $log.debug(timeObject.weatherPhrase);
                        }
                      }
                    }
                    $log.debug(validStartTimeArray);
                  //var ol = 
                  if( this.fetchGeoJSON !== undefined ) {
                    this.fetchGeoJSON.properties.forecasts = forecasts;
                    this.updateGeoJSON(this.fetchGEOJson);
                  }
              } else {
                  // invalid response
                  return $q.reject(response.data);
              }

          }, function(response) {
              // something went wrong
              return $q.reject(response.data);
          });

  }

  return pointForecast;

});