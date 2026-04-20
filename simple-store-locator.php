<?php
/**
 * Plugin Name: Simple Store Locator
 * Description: Store locator with Leaflet maps, ACF integration, and Elementor Loop support
 * Version: 1.0
 * Author: Chava Cruz Gym Member Machine
 */

if (!defined('ABSPATH')) exit;

class Simple_Store_Locator {
    
    public function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_ajax_search_stores', [$this, 'ajax_search_stores']);
        add_action('wp_ajax_nopriv_search_stores', [$this, 'ajax_search_stores']);
        add_action('wp_ajax_geocode_address', [$this, 'ajax_geocode_address']);
        add_action('wp_ajax_nopriv_geocode_address', [$this, 'ajax_geocode_address']);
        add_shortcode('store_locator_map', [$this, 'render_map']);
        add_shortcode('store_search_bar', [$this, 'render_search_bar']);
    }
    
    public function enqueue_scripts() {
        // Leaflet CSS and JS
        wp_enqueue_style('leaflet', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        wp_enqueue_script('leaflet', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', [], null, true);
        
        // Plugin CSS
        wp_enqueue_style('store-locator', plugin_dir_url(__FILE__) . 'style.css', [], '1.0');
        
        // Plugin JS
        wp_enqueue_script('store-locator', plugin_dir_url(__FILE__) . 'script.js', ['jquery', 'leaflet'], '1.0', true);
        
        // Localize script with AJAX URL and nonce
        wp_localize_script('store-locator', 'storeLocator', [
            'ajaxurl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('store_locator_nonce')
        ]);
    }
    
    public function add_store_item_class($classes, $class, $post_id) {
        if (get_post_type($post_id) === 'locations') {
            $classes[] = 'store-locator-item';
            $classes[] = 'store-item-' . $post_id;
        }
        return $classes;
    }
    
    public function render_search_bar($atts) {
        ob_start();
        ?>
        <div class="store-search-container">
            <div class="store-search-bar">
                <input 
                    type="text" 
                    id="store-address-input" 
                    placeholder="Enter your address or location..."
                    autocomplete="off"
                />
                <button id="store-search-btn" class="store-search-button">Search</button>
            </div>
            <div id="address-suggestions" class="address-suggestions"></div>
            <div id="search-status" class="search-status"></div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    public function render_map($atts) {
        $atts = shortcode_atts([
            'height' => '600px',
            'zoom' => '6'
        ], $atts);
        
        // Get all locations
        $locations = $this->get_all_locations();
        
        ob_start();
        ?>
        <div id="store-map" style="height: <?php echo esc_attr($atts['height']); ?>; width: 100%;" 
             data-zoom="<?php echo esc_attr($atts['zoom']); ?>"
             data-locations='<?php echo json_encode($locations); ?>'>
        </div>
        <?php
        return ob_get_clean();
    }
    
    private function get_all_locations() {
        $args = [
            'post_type' => 'locations',
            'posts_per_page' => -1,
            'post_status' => 'publish'
        ];
        
        $query = new WP_Query($args);
        $locations = [];
        
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $post_id = get_the_ID();
                
                $lat = get_field('latitude', $post_id);
                $lng = get_field('longitude', $post_id);
                
                if ($lat && $lng) {
                    $locations[] = [
                        'id' => $post_id,
                        'title' => get_the_title(),
                        'lat' => floatval($lat),
                        'lng' => floatval($lng),
                        'address' => get_field('address', $post_id),
                        'permalink' => get_permalink()
                    ];
                }
            }
            wp_reset_postdata();
        }
        
        return $locations;
    }
    
    public function ajax_geocode_address() {
        check_ajax_referer('store_locator_nonce', 'nonce');
        
        $query = sanitize_text_field($_POST['query']);
        
        // Use Nominatim (OpenStreetMap's geocoding service)
        $url = 'https://nominatim.openstreetmap.org/search?format=json&q=' . urlencode($query) . '&limit=5';
        
        $response = wp_remote_get($url, [
            'headers' => [
                'User-Agent' => 'WordPress Store Locator Plugin'
            ]
        ]);
        
        if (is_wp_error($response)) {
            wp_send_json_error(['message' => 'Geocoding failed']);
            return;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        wp_send_json_success($data);
    }
    
    public function ajax_search_stores() {
        check_ajax_referer('store_locator_nonce', 'nonce');
        
        $lat = floatval($_POST['lat']);
        $lng = floatval($_POST['lng']);
        $radius = 50; // 50km radius
        
        $all_locations = $this->get_all_locations();
        $nearby_locations = [];
        
        foreach ($all_locations as $location) {
            $distance = $this->calculate_distance($lat, $lng, $location['lat'], $location['lng']);
            
            if ($distance <= $radius) {
                $location['distance'] = round($distance, 2);
                $nearby_locations[] = $location;
            }
        }
        
        // Sort by distance
        usort($nearby_locations, function($a, $b) {
            return $a['distance'] <=> $b['distance'];
        });
        
        wp_send_json_success($nearby_locations);
    }
    
    private function calculate_distance($lat1, $lon1, $lat2, $lon2) {
        $earth_radius = 6371; // km
        
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        
        $a = sin($dLat/2) * sin($dLat/2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon/2) * sin($dLon/2);
        
        $c = 2 * atan2(sqrt($a), sqrt(1-$a));
        $distance = $earth_radius * $c;
        
        return $distance;
    }
}

new Simple_Store_Locator();