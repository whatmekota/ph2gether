/**
 * Words for room codes: 256 adjectives and 256 animals, so each word is 8
 * bits. Short, easy to say out loud and to spell, no two alike. The order
 * doesn't matter (a code is matched word by word), but changing the lists
 * changes which codes exist, so add to them only in a new major version.
 */

export const ADJECTIVES: readonly string[] = `
  agile amber ample azure balmy bashful beaming blushing bold bonny bouncy
  brave breathy breezy bright brisk bubbly calm candid carefree caring
  charming cheeky cheerful cherry chilly chipper chirpy chummy classy clever
  cloudy coastal comfy coral cosmic cozy crafty crimson crisp cuddly curious
  curly dainty dandy dapper daring dashing dazzling dear deft dewy dizzy
  dreamy dusky dusty eager early earnest easy elegant epic fabled fair fancy
  feisty fervent fiery flashy fleet flirty fluffy flying fond frank free fresh
  frisky frosty frothy fuzzy gallant gentle giddy gifted gilded glad glassy
  gleaming glossy glowing golden graceful grand groovy happy hardy hasty hazel
  hearty heavenly hidden honest honeyed humble hushed icy idle indigo inky
  jade jaunty jazzy jolly jovial joyful juicy jumpy keen kind kindly lacy
  lavish lazy leafy lemon lilac limber lively lofty lovely loyal lucid lucky
  lunar lush magic mauve mellow merry midnight mighty milky minty misty modest
  mossy musical mystic naughty neat nifty nimble noble nutty oaken olive opal
  orange peachy pearly peppy perky placid playful plucky plush polished polite
  proud quick quiet quirky radiant rapid rare rosy rowdy royal ruby rustic
  rusty sable saffron salty sandy sassy satin saucy scarlet secret serene
  shady shiny shy silky silver simple sleek sleepy slick smiling smooth snappy
  snazzy snowy snug soft solar sonic spicy spirited spry starry steady steamy
  stellar stormy sugary sultry sunny super supple sweet swift tangy tawny teal
  tender thirsty tidy tiny tipsy toasty topaz tranquil tropical trusty twinkly
  upbeat velvet vivid warm wavy wicked wiggly wild windy winsome wise wistful
  witty woolly zany zesty zippy
`.trim().split(/\s+/)

export const ANIMALS: readonly string[] = `
  aardvark albatross alpaca anteater antelope armadillo axolotl badger
  barracuda bat beagle bear beaver bee beetle beluga bison blackbird bluebird
  boar bobcat bonobo buffalo bulldog bunny butterfly buzzard camel canary
  capybara caribou cat catfish chameleon cheetah chick chinchilla chipmunk
  cicada clam cobra cockatoo collie condor corgi cougar cow coyote crab crane
  crayfish cricket crow cub cuckoo dachshund dalmatian deer dingo dodo dolphin
  donkey dove dragon dragonfly duck duckling eagle eel egret elephant elk emu
  ermine falcon fawn ferret finch firefly flamingo foal fox frog gazelle gecko
  gerbil gibbon giraffe gnu goat goldfish goose gopher gorilla grasshopper
  greyhound grouse gull hamster hare hawk hedgehog heron hippo hornet horse
  hound hummingbird husky hyena ibex ibis iguana impala jackal jaguar jay
  jellyfish kangaroo kestrel kingfisher kitten kiwi koala koi ladybug lamb
  lark lemming lemur leopard lion lionfish lizard llama lobster lynx macaw
  magpie mallard manatee mandrill mantis marmot marten meerkat mink minnow
  mole mongoose monkey moose moth mouse mule mustang narwhal newt nightingale
  ocelot octopus okapi opossum orca oriole oryx osprey ostrich otter owl ox
  oyster panda panther parrot partridge peacock pelican penguin pheasant pig
  pigeon piglet pika piranha platypus polecat pony poodle porcupine possum
  puffin pug puma pup puppy python quail quokka rabbit raccoon ram raven
  reindeer rhino robin rooster salamander salmon sardine scorpion seahorse
  seal shark sheep shrimp skunk sloth slug snail snake sparrow spider squid
  squirrel starfish stingray stork swallow swan tapir tarantula termite tiger
  toad tortoise toucan trout tuna turkey turtle unicorn viper vulture wallaby
  walrus warthog wasp weasel whale wolf wombat woodpecker wren yak zebra
`.trim().split(/\s+/)
