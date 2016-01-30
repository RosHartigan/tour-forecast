#!/usr/bin/perl	
 
# nws_hourly_forecast
#   Returns an hourly forecast for 72 hours from the given time
#
#	 IN: lat, lon, ut
#   OUT: 

use LWP::UserAgent;
use XML::Parser;
use XML::LibXML;
use JSON;
use Data::Dumper;
use DateTime::Format::ISO8601;
use DateTime;
use CGI;

my $query = CGI->new;

#gather the latitude and longitude
my $lat = $query->param('lat');
my $lon = $query->param('lon');

if( not defined($lat)) { 
	$lat = "47.50806";#"42.18939";
	$lon = "-111.2951970000000";#"-83.24337";
}

#gather the time
my $time_utc_str = $query->param('timeutc');

if( defined($time_utc_str)) {
	$time_utc = DateTime::Format::ISO8601->parse_datetime( $time_utc_str );			
	$time_utc->set_time_zone('UTC');
}
else {
	$time_utc = DateTime->now(time_zone => 'UTC' );
}
my  $time_zone=$time_utc->time_zone();;


# print the content header showing we are returning a json object
print $query->header(-type=>'application/json',-expires=>'+1h');



my $req_str = "http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?product=time-series";
$req_str =  $req_str."&temp=temp&wx=wx&wwa=wwa&appt=appt&icons=icons";

$req_str = $req_str."&listLatLon=".$lat.",".$lon;#."&begin=".$time_utc;#."&end=".$endTime;

#$req_str = "http://forecast.weather.gov/MapClick.php?lat=".$lat."&lon=".$lon."&FcstType=digitalDWML";

print STDERR $req_str."\n";

my $req = HTTP::Request->new(GET => $req_str);


my $ua = LWP::UserAgent->new;
my $res = $ua->request($req);

if ($res->is_success) {
	
	my $xml_string = $res->decoded_content;
	
	#get rid of carriage returns
	$xml_string =~ s/\R[\t ]*//g;
	
	# initialize parser object and parse the string
	
	$parser = new XML::LibXML;								 
	#my $doc = $parser->parse_string( $xml_string );
    
	my $doc = eval {
		$parser->parse_string($xml_string);
	};

	# report any error that stopped parsing
	if( $@ ) {
		$@ =~ s/at \/.*?$//s;               # remove module line number
		print STDERR "\nERROR in xml return:\n$@\n";
		
		;
	}
	#in data
	#	get list of locations and their keys
	#   get URL to more weather info
	#   get list(s) of valid time periods and their keys
 
	# then, for each location, get parameters
	#   within parameters, 
	#    temperature, contains list of values
	#    hazards, condtains list of azard-conditions
	#    weather, condtains list of weather-conditions
	# serialize the structure
	
	#get the locations
	my %locations;
	foreach my $location ($doc->findnodes('/dwml/data/location')) {
		my $lk="no location key";
		foreach my $location_key ($location->findnodes('.//location-key[1]') ) {
			$lk = $location_key->textContent;
			$locations{$lk}{'location-key'} = $lk;
		}
		
		# latitude and longitude
		foreach my $location_point ( $location->findnodes('.//point[1]') ) {
			if( $location_point->hasAttributes ) {
				foreach my $attr ( $location_point->attributes ) {
					#print " ".$attr->nodeName." ".$attr->getValue;
					$locations{$lk}{ $attr->nodeName } = $attr->getValue;
				}
			}
		}
		
		# description of location
		foreach my $area_description ($location->findnodes('.//area-description[1]') ) {
			$locations{$lk}{ 'area-description' } = $area_description->textContent;
			#print $area_description ->textContent;
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
	
	
	# get weather parameters for each point (only expecting one point at the moment)
	# get specific weather info for each time layout (expecting multiple)
	foreach my $lk  (keys %locations) {
		print STDERR "location ".$lk."\n";
		foreach my $parameters ($doc->findnodes('/dwml/data/parameters[@applicable-location="'.$lk.'"]')) {
			
			# loop through time layouts
			foreach my $tk  (keys %time_layouts) {
				my %hc;
				
				my @info_types = ("hazards","temperature","weather","conditions-icon");
				
				# loop through weather paramaters
				foreach my $node_name ( @info_types ) {
				
					my $node_key = $node_name;
					# get the data for this weather param if it's time layout key matches 
					foreach my $info ($parameters->findnodes('./'.$node_name.'[@time-layout="'.$tk.'"]') ) {
						if( $info->hasAttributes ) {
							foreach my $attr ( $info->attributes ) {
								if( $attr->nodeName eq "type" ) {
									#eg temperature_hourly
									#   temperature_apparent
									$node_key = $node_name."_".$attr->getValue;
								}
							}
						}
					
						foreach my $name ($info->findnodes('./name')) {
							$hc{$node_key}{'name'} = $name->textContent;
						}

						print STDERR "  ".$tk." ".$hc{$node_key}{'name'}."\n";
						
						my $idx = 0;
						my $repeated_var = "value";
						if( $node_name eq "weather" ) {
							$repeated_var = "weather-conditions";
						}
						elsif( $node_name eq "hazards" ) {
							$repeated_var = "hazard-conditions";
						}
						elsif( $node_name eq "conditions-icon" ) {
							$repeated_var = "icon-link";
						}
						
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
							}
							else {
								$value_text = $condition->textContent;
							}

							$hc{$node_key}{'values'}[$idx] = $value_text;
							$idx++;
						}
					}
				}
				
				#now: run through hour 0 through 72
				#translate from hours to index in time layout
				#copy data into our locations hash
				my $target_idx = 0;
				my $src_idx = 0;
				my $w_dt = $time_utc->clone();
				for( my $target_idx = 0; $target_idx < 72; $target_idx++ ) {
					
					for( ; $src_idx < $time_layouts{$tk}{ 'num_times' } - 1; $src_idx++ ) {
						my $cur_dt = $time_layouts{$tk}{ 'times' }[$src_idx];
						my $next_dt = $time_layouts{$tk}{ 'times' }[$src_idx + 1];
						
							my $lt = $w_dt->clone();
							$lt->set_time_zone($time_zone);
							
							print STDERR $lt->iso8601().$lt->strftime("%z")."\n";
							$locations{$lk}{'data'}[$target_idx]{'time'} = $lt->iso8601().$lt->strftime("%z");
							$locations{$lk}{'data'}[$target_idx]{'time_utc_str'} = $time_utc_str;
							$locations{$lk}{'data'}[$target_idx]{'time_utc'} = $time_utc->iso8601().$time_utc->strftime("%z");

							if ($cur_dt > $w_dt) {
							foreach my $info_key (keys %hc) {
								$locations{$lk}{'data'}[$target_idx]{$info_key} = "No data";
							}
							print STDERR "  $tk no src for hr $target_idx (".$w_dt."). Starts ".$cur_dt."\n";
							last;
						} elsif( $cur_dt <= $w_dt && $next_dt > $w_dt ) {
							#move data from src index to target index
							foreach my $info_key (keys %hc) {
								$locations{$lk}{'data'}[$target_idx]{$info_key} = $hc{$info_key}{'values'}[$src_idx];
								
							}

							last;
						}
						else {
							#print $cur_dt." ".$w_dt." " .$src_idx." != ".$target_idx."\n";
						}
			
					}
			
					$w_dt->add(minutes => 60);
				}
				
			}
		}	
	}
	
    my $json = encode_json \%locations;

	print $json;
			
  
	
}
else {
	print STDERR $res->status_line;
}

