#!/usr/bin/perl	
 
# nws_dwml_forecast
#   Returns an hourly forecast for given lat,lon 72 hours from the given time
#   Returns geoJSON FeatureCollection containing Feature for lat,lon 
#		properties contains:
#			moreWeatherInformation: URL of detailed forecast
#			?? time zone?
#			?? Description of area
#			?? credit/forecast url
#			forecastSeries: array of forecasts by time slice
#					contains:
#						"hazards",
#						"temperature",
#						"weather-text",
#						"weather-icon",
#						"end-time",			(ut)
#						"start-time",		(ut)
#						"local-time"
#
#
#	 IN: lat, lon, ut (unused)
#   OUT: geoJSON FeatureCollection
#
#
#	This script uses NWS services to get hourly data.  This is the most complete source of free hourly 
#	weather data, unfortunaly, the products are somewhat disorganized. It's also only good in the US.
#
#	So the output will be build like this:
#
#	First call the digitalJSON product from the forecast service
#   http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalJSON&lat=43.6389&lon=-83.291
#		this yields hourly weather information including temp, weather summary, and icons.  
#		However it is missing hazards
#
#	If we can't parse it for some reason ?? try the digitalDWML product from the same service
#
#   http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalDWML&lat=43.6389&lon=-83.291
#		This yields a similar report but no icons (why???) and less nice text weather summary
#
#	OR the gml product from the graphical service, which unfortunately gives only three hour updates
#	http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?gmlListLatLon=43.6389&lon,-83.291&featureType=Forecast_Gml2Point&propertyName=icons,wx&startTime=2016-01-01T00:00:00&compType=Between";
#
#	Now we can call the the graphical service to get a DWML product containing all the hazards for each hour
#	http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?product=time-series&wwa=wwa&listLatLon=43.6389&lon,-83.291
#
#
#	So that gives us three formats to parse:
#		DWML
#		GML
#		NWS's own digitalJSON format which is LOOSELY based on DWML
#
#	And we will output geoJSON as notated above
#
#	Written by Ros Hartigan in 2016
#	www.xrgb.com
#	www.tourforecast.com
#

use LWP::UserAgent;
use XML::Parser;
use XML::LibXML;
use JSON;
use Data::Dumper qw(Dumper);
use DateTime::Format::ISO8601;
use DateTime;
use CGI;
use CGI::Carp;

sub compileForecastFromDWML($\%);

my $query = CGI->new;

# only allowing GET
$ENV{'REQUEST_METHOD'} =~ tr/a-z/A-Z/;
if (defined($ENV) && $ENV{'REQUEST_METHOD'} ne "GET")
{
	print $query->header(
	  	-type=>'text/plain',
		-status=> '405 Method Not Allowed'
	);
	exit;
}

#gather the latitude and longitude
my $lat = $query->param('lat');
my $lon = $query->param('lon');

if (! defined($ENV) ) {
	($lat, $lon) = 	@ARGV;
}

# allow them to be undefined
if( not (defined($lat) && defined($lon) && length($lat)>0 && length($lon)>0)) { 

	$lat = "41.0002";  #"42.18939";
	$lon = "-115.5012";#"-83.24337";
}


#gather the passed time and time_zone
#not really using this... soon to be deprecated
my $user_time_utc_str = $query->param('timeutc');
my $time_zone;

if( defined($user_time_utc_str) && length($user_time_utc_str)>0) {
	$user_time_utc = DateTime::Format::ISO8601->parse_datetime( $user_time_utc_str );	
	$user_time_zone=$time_utc->time_zone();		
	$user_time_utc->set_time_zone('UTC');
}
else {
	$user_time_utc = DateTime->now(time_zone => 'UTC' );
	$user_time_zone=$user_time_utc->time_zone();		
}


# print the content header showing we are returning a json object
print $query->header(-type=>'application/json',-expires=>'+1h');

#create the feature array
my @features;

# and our solitary feature
my $latLonString =  $lat.",".$lon;
		
my $feature = {
	type => "Feature",
	id => $latLonString,
	geometry => {
		type => "Point",
		coordinates => $latLonString
	},
	properties => {
		'sources' => ()
	}
};
		
		
# first we try to use the experimental NWS product - digitalJSON

#lastly the DWML time series product that returns warnanings
my $req_str = "http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?product=time-series";

# fetch temp, weather icons, weather text, and hazards
$req_str =  $req_str."&temp=temp&wx=wx&icons=icons&wwa=wwa";

# at our location
$req_str = $req_str."&listLatLon=".$lat.",".$lon;#."&begin=".$time_utc;


my $req = HTTP::Request->new(GET => $req_str);
my $ua = LWP::UserAgent->new;
my $res = $ua->request($req);

if ($res->is_success) {
	
	my $xml_string = $res->decoded_content;
	
	#get rid of carriage returns
	$xml_string =~ s/\R[\t ]*//g;
	
	# initialize parser object and parse the string
	$parser = new XML::LibXML;								 
	
	my $doc = eval {
		$parser->parse_string($xml_string);
	};

	# report any error that stopped parsing
	if( $@ ) {
		$@ =~ s/at \/.*?$//s;               # remove module line number
		print STDERR "\nERROR in xml return:\n$@\n";
		print $query->header(
		  	-type=>'text/plain',
			-status=> '501 Malformed XML returned from graphical.weather.gov'
		);
		exit;
		
	}
	#glean our geoJSON forecast data from the DWML
	compileForecastFromDWML($doc, \$feature);

	my $featureCollection = {
		type => "FeatureCollection",
		features => \@features
	};
	
	# now create our geoJSON FeatureCollection
	my $json = JSON->new->allow_nonref;

	# pretty print for shell
	my $use_pretty = not defined($ENV);
	my $pretty_printed = $json->pretty($use_pretty)->encode( $featureCollection );

	print $pretty_printed;
}
else {
	print $query->header(
	  	-type=>'text/plain',
		-status=>  $res->status_line
	);
	print STDERR $res->status_line."\n";
}

# 
#	compileForecastFromDWML
#
#	POPULATE geoJSON feature from DWML XML doc	
#	IN:
sub compileForecastFromDWML($\%) {
	my ($doc) = shift;
	my ($feature) = shift;

	#in data
	#	get list of locations and their keys
	#	get URL to disclaimer
	# 	get URL to attribution/attribution logo
	#   get list(s) of valid time periods and their keys
 
	# then, for each location
	#   get URL to more weather info
	#   get parameters:
	#    temperature, contains list of values
	#    hazards, condtains list of azard-conditions
	#    weather, condtains list of weather-conditions
	# serialize the structure
	
	#get the locations
	my %locations;

	foreach my $location ($doc->findnodes('/dwml/data/location')) {

		my %location;

		my $lk="no location key";
		foreach my $location_key ($location->findnodes('.//location-key[1]') ) {
			$lk = $location_key->textContent;
			$location{'location-key'} = $lk;
		}

		# description of location
		foreach my $area_description ($location->findnodes('.//area-description[1]') ) {
			$location{ 'area-description' } = $area_description->textContent;
		}	

		# latitude and longitude
		my $bLatMatches = false;
		my $bLonMatches = false;
		foreach my $location_point ( $location->findnodes('.//point[1]') ) {
			if( $location_point->hasAttributes ) {
				foreach my $attr ( $location_point->attributes ) {
					$location{ $attr->nodeName } = $attr->getValue;
				}
			}
		}
			
		#only return the data for our point
		if( index($lat,$location{'latititude'}) != -1 && index($lon,$location{'longitude'}) != -1  ) {
			print STDERR $lk.", ".$lat.", ".$lon."\n";
			$locations{$lk} = \%location;
		}			
	} 
	
	#get the time layouts
	my %time_layouts;

	foreach my $time_layout ($doc->findnodes('/dwml/data/time-layout')) {
		my $tk="no time key";
		my $bLocal = 0;
		
		#each key has a format something like:
		# k-p1h-n63-2
		foreach my $layout_key ($time_layout->findnodes('.//layout-key[1]') ) {
			$tk = $layout_key->textContent;
			$time_layouts{$tk}{'layout-key'} = $tk;
		}
		# glean the time layouts attributes (local/global)
		if( $time_layout->hasAttributes ) {
			
			foreach my $attr ( $time_layout->attributes ) {
				# check local/global
				if( $attr->nodeName eq "time-coordinate" ) {
					$bLocal = $attr->getValue eq "local";
				}
				# summarization?  not sure what to do if this is true.
				
				$time_layouts{$tk}{ $attr->nodeName } = $attr->getValue;
			}
		}		
		
		my $idx=0;
		foreach my $t ($time_layout->findnodes('./start-valid-time') ) {
			my $datetime_str = $t->textContent;
			my $dt = DateTime::Format::ISO8601->parse_datetime( $datetime_str );
			#print STDERR $datetime_str."\n";
			# check for errors here
			# todo: use bLocal?
			$time_zone = $dt->time_zone();
			$dt->set_time_zone('UTC');
			
			$time_layouts{$tk}{ 'times' }[$idx] = $dt;
			$idx++;
		}
		# todo: should match nDD segment of time layout key
		$time_layouts{$tk}{ 'num_times' } = $idx;		
	} 
	
	# create feature array for the featureCollection object	
	
	# get weather parameters for each point (only expecting one point at the moment)
	# get specific weather info for each time layout (expecting multiple)
	foreach my $lk  (keys \%locations) {
		
		
		foreach my $mwi ($doc->findnodes('/dwml/data/moreWeatherInformatione[@applicable-location="'.$lk.'"]')) {
			$feature->{'properties'}{'moreWeatherInformation'} = $mwi->textContent;
		}
		
		# now scoop up the forecast info into any array of blocks keyed by time
		my %data;
		foreach my $parameters ($doc->findnodes('/dwml/data/parameters[@applicable-location="'.$lk.'"]')) {
			
			# loop through time layouts
			foreach my $tk  (keys %time_layouts) {
				my %hc;
				
				my @info_types = ("hazards","temperature","weather","conditions-icon");
				
				# loop through weather paramaters
				foreach my $node_name ( @info_types ) {
				
					my $node_key = $node_name;
					
						# massage the keys to the output we want, as well as get the repeated value
					my $repeated_var = "value";
					if( $node_name eq "weather" ) {
						$repeated_var = "weather-conditions";
						$node_key = "weather-text";
					}
					elsif( $node_name eq "hazards" ) {
						$repeated_var = "hazard-conditions";
					}
					elsif( $node_name eq "conditions-icon" ) {
						$repeated_var = "icon-link";
						$node_key = "weather-icon";
					}

					# get the data for this weather param if it's time layout key matches 
					foreach my $info ($parameters->findnodes('./'.$node_name.'[@time-layout="'.$tk.'"]') ) {
						if( $info->hasAttributes && $node_name eq "temperature") {
							foreach my $attr ( $info->attributes ) {
								if( $attr->nodeName eq "type" && $attr->getValue != "hourly" ) {
									#eg temperature_hourly
									#   temperature_apparent
									$node_key = $node_name."-".$attr->getValue;
								}
							}
						}
					
						
						foreach my $name ($info->findnodes('./name')) {
							$hc{$node_key}{'name'} = $name->textContent;
						}

						#print STDERR "  ".$tk." ".$hc{$node_key}{'name'}."\n";
						
						my $idx = 0;
						
						
						# now scoop up the parameter value for each time period
						foreach my $condition ($info->findnodes('./'.$repeated_var) ) {
							my $value_text = "";
							if( $repeated_var eq "weather-conditions" ) {
								#weather consists of a list of values
								# these values can contain visibility elements which I am ignoring
								# the values elements contain attributes which combine to provide weather text:
								#    coverage, weather-type, intensity describe the weather for each value element
								
								#    additive defines how to combine this weather description with others
								#    qualifiers does what?
															
								foreach my $val ($condition->findnodes('./value')) {
	
									my $coverage_text = "";
									my $post_coverage_text = "";
									my $weathertype_text = "";
									my $intensity_text = "";
									my $qualifier_text = "";
									
									if( $val->hasAttributes ) {
										foreach my $va ( $val->attributes ) {
											if( $va->nodeName eq "coverage" ) {
												if($va->getValue eq "likely" || $va->getValue eq "definitely" ) {
													$post_coverage_text = $va->getValue." ";
												}
												elsif ($va->getValue eq "none") {
												}
												else {
													$coverage_text = $va->getValue." ";
												}
											}
											elsif ( $va->nodeName eq "intensity" ) {
												if ($va->getValue ne "none") {
													$intensity_text = $va->getValue." ";
												}
											}
											elsif ( $va->nodeName eq "weather-type" ) {
												$weathertype_text = $va->getValue." ";
											}
											elsif( $va-nodeName eq "additive" ) {
												$weather_text = $weather_text.$va->getValue." ";
											}
											elsif( $va-nodeName eq "qualifier" ) {
												if ($va->getValue ne "none") {
													$qualifier_text = "(".$va->getValue.") ";
												}
											}
										}
										
										$value_text = $value_text.$coverage_text.$intensity_text.$weathertype_text.$qualifier_text;
									}
								}
								#print $value_text.", ";
							}
							elsif ($node_name eq "hazards" ) {
								foreach my $hazard ($condition->findnodes('./hazard')) {
	
									my $phenomena_text = "";
									my $signiciance_text = "";
									
									# first figure out what to call it
									if( $hazard->hasAttributes ) {
										foreach my $va ( $hazard->attributes ) {
											if( $va->getValue ne "none") {
												if( $va->nodeName eq "phenomena" ) {
													
													$phenomena_text = $va->getValue." ";
													
												}
												elsif ( $va->nodeName eq "significance" ) {
													$signiciance_text = $va->getValue;
												}
											}
										}
										
										$value_text = $phenomena_text.$signiciance_text;
									}
									# now get the url
									my $hazard_url = "";
									foreach my $hu ($hazard->findnodes('./hazardTextURL') ) {
										$hazard_url = $hu->textContent;
									}
									
									if( length($value_text) eq 0 ) {
										$value_text = $hazard_url;
									}
									elsif( length($hazard_url) ne 0  ) {

									}
								}
								# TODO: interpret hazards:
								#<hazard hazardCode="WW.Y" phenomena="Winter Weather" significance="Advisory" hazardType="long duration">
								#	<hazardTextURL>http://forecast.weather.gov/wwamap/wwatxtget.php?cwa=lkn&wwa=Winter%20Weather%20Advisory</hazardTextURL>
								#</hazard>

								#for now just scoop up the hazard URL
								$value_text = $condition->textContent;
							}
							else {
								$value_text = $condition->textContent;
							}

							$hc{$node_key}{'values'}[$idx] = $value_text;
							$idx++;
						}
					}
				}
				
				#copy data for each time layout into our single hourly layout
				for(my $src_idx = 0; $src_idx < $time_layouts{$tk}{ 'num_times' } - 1; $src_idx++ ) {
					
					# first check if we have any actual data:
					my $has_data = false;
					foreach my $info_key (keys %hc) {
						my $v = $hc{$info_key}{'values'}[$src_idx];
						if( defined($v) && $v != null && length($v)>0) {
							$has_data = true;						
						}
					}
					if( $has_data eq true ) {
						my $cur_dt = $time_layouts{$tk}{ 'times' }[$src_idx];
						my $next_dt = $time_layouts{$tk}{ 'times' }[$src_idx + 1];
						
						#use UTC for key
						my $time_key = $cur_dt->iso8601()."_". $next_dt	->iso8601();

						#also pass local time to make our lives easier
						my $lt = $cur_dt->clone();
						$lt->set_time_zone($time_zone);
						
						$data{$time_key}{'start_time_utc'} = $cur_dt->iso8601();
						$data{$time_key}{'end_time_utc'} = $next_dt->iso8601();
						$data{$time_key}{'time'} = $lt->iso8601().$lt->strftime("%z");
					
						foreach my $info_key (keys %hc) {
							$data{$time_key}{$info_key} = $hc{$info_key}{'values'}[$src_idx];
						}
					}
					
				} # looping over times	
			} #looping over time layouts

		} #looping over weather parameters	

		# now build a Feature based on this location information
		my @forecastSeries = ();
		foreach my $k (sort(keys %data)) {
			push(\@forecastSeries, $data{$k});
		}
		$feature->{'properties'}{'forecastSeries'} = \@forecastSeries;

		push( \@features, $feature);
	
	} #looping over locations

}

