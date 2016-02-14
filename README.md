Tour Forecast
=============

A web app that allows you to check the forecast for your roadtrip, leaving either now or at some point over the next few days.

You can see it working at [Tour Forecast](http://www.bluepontiacmusic.com/tourforecast)

I put it together using a CGI perl script to fetch the forecast from NWS, created the front end using Angular and Google Maps, mainly as a way to experiment with Angular and NWS's digital forecast products.

Currently relying on 
[Angular](https://angularjs.org/), 
[Google Maps](https://developers.google.com/maps/), 
[Angular Bootstrap](https://github.com/angular-ui/bootstrap), 
[angular-google-maps](https://github.com/angular-ui/angular-google-maps), 
[seiyria-bootstrap-slider](https://github.com/seiyria/bootstrap-slider), 
[angular-bootstrap-slider](https://github.com/seiyria/angular-bootstrap-slider)

## Changes to be made

Testing
 --yes

Reduce dependencies
 
 --remove angular-google-map dependency, switch to data layer for icon display
 --stop using slider

Change back-end model
 -- switch the CGI/perl backend to something else that makes integrated testing easier? python? jsonp/javascript 
 -- Move the whole thing to a designated server using play/java on the backend perhaps!

Other improvments
 --try OpenWeatherLayer, Weather Underground, and yr.no for forecasts outside of US
 --try mapbox/leaflet for the map/directions

Pie in the sky:
Add forecast map overlays using NWS digital imaging service

